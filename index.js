// 响应式系统
let activeEffect;

const TriggerType = {
  SET: "SET",
  ADD: "ADD",
  DELETE: "DELETE",
};

// for in 循环遍历设置的 key值
const ITERATE_KEY = Symbol("ITERATE_KEY");
// 访问响应式对象的代理对象的key值
const RAW = Symbol("RAW");

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
  if (!activeEffect || !shouldTrack) return;
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
function trigger(target, key, type, newVal) {
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
  // 如果操作目标是数组，并且修改了数组的 length 属性，则对于索引大于或等于新设置数组的 length 值的元素，需要执行相关副作用函数
  if (Array.isArray(target) && key === "length") {
    depsMap.forEach((effects, key) => {
      if (key >= newVal) {
        effects.forEach((effectFn) => {
          if (effectFn !== activeEffect) {
            effectsToTun.add(effectFn);
          }
        });
      }
    });
  }

  // 当操作类型是ADD并且目标对象是数组时，应该取出并执行那些与 length属性相关联的副作用函数
  if (type === TriggerType.ADD && Array.isArray(target)) {
    const lengthEffects = depsMap.get("length");
    lengthEffects &&
      lengthEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToTun.add(effectFn);
        }
      });
  }

  // for in操作和delete操作
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

// 重新定义数组的某些方法以支持响应式系统
const arrayInstrumentations = {};
["includes", "indexOf", "lastIndexOf"].forEach((method) => {
  const originMethod = Array.prototype[method];
  arrayInstrumentations[method] = function (...args) {
    // this是代理对象，先在代理对象中查找，将结果存储到 res 中
    let res = originMethod.apply(this, args);
    if (res === false || res === -1) {
      // res为false 说明没有找到， 通过 this.raw 拿到原始数组，再去其中查找并更新 res 值
      res = originMethod.apply(this[RAW], args);
    }
    return res;
  };
});

// 重新定义数组的push 方法以支持响应式系统
let shouldTrack = true;
["push", "pop", "shift", "unshift", "splice"].forEach((method) => {
  // 取得原始 push 方法
  const originMethod = Array.prototype[method];
  arrayInstrumentations[method] = function (...args) {
    // 在调用原始方法之前，禁止追踪
    shouldTrack = false;
    // push方法的默认行为
    let res = originMethod.apply(this, args);
    // 在调用原始方法之后，恢复原来的行为，即允许追踪
    shouldTrack = true;
    return res;
  };
});

function createReactive(obj, { isShallow = false, isReadonly = false } = {}) {
  return new Proxy(obj, {
    // 检查删除属性
    deleteProperty(target, key) {
      if (isReadonly) {
        console.warn(`属性${key}是只读的`);
        return true;
      }
      // 检查被操作的属性是否是对象自己的属性
      const hadKey = Object.prototype.hasOwnProperty.call(target, key);
      // 使用Reflect.deleteProperty完成属性的删除
      const res = Reflect.deleteProperty(target, key);
      if (res && hadKey) {
        trigger(target, key, TriggerType.DELETE);
      }
    },
    ownKeys: (target) => {
      // 将副作用函数与 ITERATE_KEY关联起来 捕获 for...in操作， 如果是数组，则捕获length属性（因为数组length的修改会影响到数组的for...in操作）
      track(target, Array.isArray(target) ? "length" : ITERATE_KEY);
      return Reflect.ownKeys(target);
    },

    // 拦截 in 操作
    has: (target, key) => {
      track(target, key);
      return Reflect.has(target, key);
    },
    get: (target, key, receiver) => {
      if (key === RAW) {
        return target;
      }
      // 如果操作的目标对象是数组，并且key存在于 arrayInstrumentations上，那么返回定义在 arrayInstrumentations
      if (Array.isArray(target) && arrayInstrumentations.hasOwnProperty(key)) {
        return Reflect.get(arrayInstrumentations, key, receiver);
      }

      // 非只读或非key的类型是symbol(for of 会访问数组的迭代器和length属性)的时候才需要建立响应联系
      if (!isReadonly && typeof key !== "symbol") {
        track(target, key);
      }

      const res = Reflect.get(target, key, receiver);
      if (isShallow) {
        return res;
      }
      // 如果访问的是对象，则递归调用
      if (typeof res === "object" && res !== null) {
        return isReadonly ? readonly(res) : reactive(res);
      }
      return res;
    },
    set: (target, key, newVal, receiver) => {
      if (isReadonly) {
        console.warn(`属性${key}是只读的`);
        return true;
      }
      // 先获取旧值
      const oldValue = target[key];

      // 如果代理目标是数组，则检测被设置的索引值是否小于数组的长度
      const type = Array.isArray(target)
        ? Number(key) < target.length
          ? TriggerType.SET
          : TriggerType.ADD
        : // 如果属性不存在，则证明此属性是新增，否则是修改该属性
        Object.prototype.hasOwnProperty.call(target, key)
        ? TriggerType.SET
        : TriggerType.ADD;
      const res = Reflect.set(target, key, newVal, receiver);
      // raw为人为自定义添加到属性，如果两者相等，说明 receiver就是 target 的代理对象
      if (target === receiver[RAW]) {
        // 新旧值不相等，且都不是NaN时 （因为NaN !== NaN结果为true）
        if (
          oldValue !== newVal &&
          (oldValue === oldValue || newVal === newVal)
        ) {
          trigger(target, key, type, newVal);
        }
      }
      return res;
    },
  });
}

// 定义一个Map实例，存储原始对象到代理对象到映射
const reactiveMap = new Map();

function reactive(obj) {
  // 优先通过原始对象 obj 寻找之前创建的代理对象，如果找到了，直接返回已有的代理对象
  const existionProxy = reactiveMap.get(obj);
  if (existionProxy) return existionProxy;

  // 否则，创建新的代理对象
  const proxy = createReactive(obj);
  // 存储到Map中，从而避免重复创建
  reactiveMap.set(obj, proxy);
  return proxy;
}

function shallowReactive(obj) {
  return createReactive(obj, { isShallow: true });
}

// 只读函数
function readonly() {
  return createReactive(obj, {
    isShallow: false,
    isReadonly: true,
  });
}

function shallowReadonly(obj) {
  return createReactive(obj, { isShallow: true, isReadonly: true });
}

// test 区域
const arr = reactive([123, 456]);
effect(() => {
  console.log(arr.includes(123));
});
