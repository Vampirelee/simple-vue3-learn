// 响应式系统
let activeEffect;

const TriggerType = {
  SET: "SET",
  ADD: "ADD",
  DELETE: "DELETE",
};

// 源数据
const data = {
  foo: 1,
  bar: 2,
};

// 定义一个任务队列
const jobQueue = new Set();
// 使用 Promise.resolve()创建一个promise实例，我们用它将一个任务添加到微任务队列
const p = Promise.resolve();
// 一个标志代表是否正在刷新队列
let isFlushing = false;

function flushJob() {
  // 如果队列正在刷新，则什么都不做
  if (isFlushing) return;
  // 设置为true，代表正在刷新
  isFlushing = true;
  // 在微任务队列中刷新 jobQueue队列
  p.then(() => {
    jobQueue.forEach((job) => job());
  }).finally(() => {
    // 结束后重置 isFlushing
    isFlushing = false;
    // 清空本次任务队列
    jobQueue.clear();
  });
}

// 收集依赖的桶
const bucket = new WeakMap();

// 副作用函数堆栈（用于解决effect可以嵌套执行）
const effectStack = [];

const ITERATE_KEY = Symbol();
const obj = new Proxy(data, {
  // 检查删除属性
  deleteProperty(target, key) {
    // 检查被操作的属性是否是对象自己的属性
    const hadKey = Object.prototype.hasOwnProperty.call(target, key);
    // 使用Reflect.deleteProperty完成属性的删除
    const res = Reflect.deleteProperty(target, key);
    if (res && hadKey) {
      trigger(target, key, TriggerType.DELETE);
    }
  },
  ownKeys: (target) => {
    // 将副作用函数与 ITERATE_KEY关联起来
    track(target, ITERATE_KEY);
    return Reflect.ownKeys(target);
  },

  // 拦截 in 操作
  has: (target, key) => {
    track(target, key);
    return Reflect.has(target, key);
  },
  get: (target, key, receiver) => {
    track(target, key);
    return Reflect.get(target, key, receiver);
  },
  set: (target, key, value, receiver) => {
    // 如果属性不存在，则证明此属性是新增，否则是修改该属性
    const type = Object.prototype.hasOwnProperty.call(target, key)
      ? TriggerType.SET
      : TriggerType.ADD;
    const res = Reflect.set(target, key, value, receiver);
    trigger(target, key, type);
    return res;
  },
});

/* effect(
  () => {
    console.log("effectFn foo 执行");
    console.log(obj.foo);
  },
  {
    scheduler(fn) {
      // 每次调度时，将副作用函数添加到 jobQueue 队列中
      jobQueue.add(fn);
      // 调用 flushJob 刷新队列
      flushJob();
    },
  }
); */

// 副作用
function effect(fn, options = {}) {
  const effectFn = () => {
    // 清空该副作用函数的所有依赖
    cleanup(effectFn);
    activeEffect = effectFn;
    effectStack.push(effectFn);

    const res = fn();
    effectStack.pop();
    activeEffect = effectStack[effectStack.length - 1];
    return res;
  };
  effectFn.options = options;
  effectFn.deps = [];

  // lazy属性
  if (!options.lazy) {
    effectFn();
  }
  return effectFn;
}

const sumRes = computed(() => obj.bar + obj.foo);
effect(() => {
  console.log("computed:", sumRes.value);
});

// computed计算函数
function computed(getter) {
  let value;
  let dirty = true;
  const fn = () => {
    dirty = true;
    // 当计算属性依赖的响应式数据变化时，手动调用 trigger 函数出发响应
    trigger(obj, "value");
  };
  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      // 每次调度时，将副作用函数添加到 jobQueue 队列中
      jobQueue.add(fn);
      // 调用 flushJob 刷新队列
      flushJob();
    },
  });
  const obj = {
    get value() {
      if (dirty) {
        value = effectFn();
        dirty = false;
      }
      // 当读取 value 时，手动调用 track 函数进行追踪
      track(obj, "value");
      return value;
    },
  };
  return obj;
}
watch(
  () => obj.bar,
  (newVal, oldValue) => {
    console.log(newVal, oldValue);
  }
);

// watch函数实现
function watch(source, cb, options = {}) {
  // 定义getter
  let getter;
  // 如果 source 是函数，说明用户传递的是getter， 所以直接把 source 赋值给 getter
  if (typeof source === "function") {
    getter = source;
  } else {
    // 否则按照原来的实现调用 traverse 递归地读取
    getter = () => traverse(source);
  }
  // 定义旧值和新值
  let oldValue, newValue;
  // 定义清除函数
  let cleanup;
  // cleanup用来存储用户注册的过期回调函数
  const onInvalidate = (fn) => {
    // 将过期回调存储到 cleanup中
    cleanup = fn;
  };
  const job = () => {
    newValue = effectFn();
    // 在调用回调函数 cb 之前，先调用过期回调
    if (cleanup) {
      cleanup();
    }
    if (oldValue === newValue) return;
    // 将旧值和新值作为回调函数的参数
    // 当数据变化时，调用回调函数 cb
    cb(newValue, oldValue, onInvalidate);
    // 更新就只，不然下一次会得到错误的旧值
    oldValue = newValue;
  };

  // 使用 effect 注册副作用函数时，开启 lazy 选型，并把返回值存储到 effectFn 中以便后续手动调用
  const effectFn = effect(getter, {
    lazy: true,
    scheduler: () => {
      if (options.flush === "post") {
        const p = Promise.resolve();
        p.then(job);
      } else {
        job();
      }
    },
  });
  if (options.immediate) {
    job();
  } else {
    oldValue = effectFn();
  }
}
// traverse函数
function traverse(value, seen = new Set()) {
  // 如果要读取的数据是原始值，或者已经被读取过了，那么什么都不做
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  // 将数据添加到seen中， 代表遍历地读取过了，避免循环引用引起的死循环
  seen.add(value);
  // 暂时不考虑数组等其他结构
  // 假设 value 就是一个对象，使用 for ... in 读取对象的每一个值，并递归地调用 traverse 进行处理
  for (const k in value) {
    traverse(value[k], seen);
  }
  return value;
}

/**
 * 收集依赖前先清除相关依赖
 * @param {*} effectFn
 */
function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    const deps = effectFn.deps[i];
    deps.delete(effectFn);
  }
  effectFn.deps.length = 0;
}

// track收集依赖
function track(target, key) {
  if (!activeEffect) return;
  let depsMap = bucket.get(target);
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()));
  }
  let deps = depsMap.get(key);
  if (!deps) {
    depsMap.set(key, (deps = new Set()));
  }
  deps.add(activeEffect);
  activeEffect.deps.push(deps);
}
// trigger触发更新
function trigger(target, key, type) {
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  // 需要运行的副作用函数
  const effectsToTun = new Set();
  const effects = depsMap.get(key);

  effects &&
    effects.forEach((effectFn) => {
      if (effectFn !== activeEffect) {
        effectsToTun.add(effectFn);
      }
    });

  if (type === TriggerType.ADD || type === TriggerType.DELETE) {
    const iterateEffects = depsMap.get(ITERATE_KEY);
    iterateEffects &&
      iterateEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToTun.add(effectFn);
        }
      });
  }
  effectsToTun.forEach((effectFn) => {
    // 如果一个副作用函数存在调度器，则调用该调度器，并将副作用函数作为参数传递
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn);
    } else {
      effectFn();
    }
  });
}

console.log("结束了");
const update = () => {
  obj.foo = 1;
  obj.foo = 1;
  obj.foo = 1;
  obj.foo = 1;
  obj.foo = 1;
  obj.foo = 1;
  obj.foo = 1;
  obj.foo = 1;
  obj.foo = 1;
  obj.bar = 1;
  obj.bar = 1;
  obj.bar = 1;
  obj.bar = 1;
  obj.bar = 1;
  obj.bar = 1;
  obj.bar = 1;
  obj.bar = 1;
  obj.bar = 1;
  obj.foo = 10;
  obj.bar = 10;
};
update();
setTimeout(() => {
  obj.foo++;
}, 1000);
