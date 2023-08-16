// 响应式系统
let activeEffect;

const TriggerType = {
  SET: "SET",
  ADD: "ADD",
  DELETE: "DELETE",
};

// for in 循环遍历设置的 key值
const ITERATE_KEY = Symbol("ITERATE_KEY");
// for in 循环便利设置的 key值（对于key值）
const MAP_KEY_ITERATE_KEY = Symbol("MAP_KEY_ITERATE_KEY");
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
  // 操作类型为ADD或DELETE
  if (
    (type === TriggerType.ADD || type === TriggerType.DELETE) &&
    target instanceof Map
  ) {
    const iterateEffects = depsMap.get(MAP_KEY_ITERATE_KEY);
    iterateEffects &&
      iterateEffects.forEach((effectFn) => {
        if (effectFn !== activeEffect) {
          effectsToTun.add(effectFn);
        }
      });
  }
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

  // for in操作和delete操作。 如果操作类型是 SET，并且目标对象是 Map 类型的数据，也应该触发那些与 ITERATE_KEY 相关联的副作用函数重新执行
  if (
    type === TriggerType.ADD ||
    type === TriggerType.DELETE ||
    (type === TriggerType.SET &&
      Object.prototype.toString.call(target) === "[object Map]")
  ) {
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
      // res为false 说明没有找到， 通过 this.raw 拿到原始数组，再去其中查找并更新 res 值（解决查询对象的问题）
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
    // 在调用原始方法之前，禁止追踪（这些方法会触发length相关依赖，导致死循环）
    shouldTrack = false;
    // push方法的默认行为
    let res = originMethod.apply(this, args);
    // 在调用原始方法之后，恢复原来的行为，即允许追踪
    shouldTrack = true;
    return res;
  };
});

// 重新定义Set、Map原型上的方法，以便更好地支持响应式系统
const mutableInstrumentations = {
  add(item) {
    // this仍然指向代理对象，通过RAW属性获取到原始对象
    const target = this[RAW];
    const hasKey = target.has(item);
    const res = target.add(item);
    // 当要添加的元素不存在时，才触发响应
    if (!hasKey) trigger(target, ITERATE_KEY, TriggerType.ADD);
    return res;
  },
  delete(item) {
    const target = this[RAW];
    const hasKey = target.has(item);
    const res = target.delete(item);
    // 当要删除的元素确实存在时，才触发响应
    if (hasKey) trigger(target, ITERATE_KEY, TriggerType.DELETE);
    return res;
  },
  get(key) {
    // 获取原始对象
    const target = this[RAW];
    const hasKey = target.has(key);
    // 追踪依赖，建立响应联系
    track(target, key);
    // 如果存在，则返回结果。这里要注意的是，如果得到的结果 res 仍然是可代理的数据。则要返回使用 reactive 包装后的响应式数据
    if (hasKey) {
      const res = target.get(key);
      return typeof res === "object" ? reactive(res) : res;
    }
  },
  set(key, value) {
    const target = this[RAW];
    const hasKey = target.has(key);
    // 获取旧值
    const oldValue = target.get(key);
    // 获取原始数据，由于value 本身可能已经是原始数据，所以此时value.raw不存在，则直接使用value
    target.set(key, value[RAW] || value);
    // 如果不存在，则说明是新增的元素
    if (!hasKey) {
      trigger(target, ITERATE_KEY, TriggerType.ADD);
    } else if (
      oldValue !== value ||
      (oldValue === oldValue && value === value)
    ) {
      trigger(target, key, TriggerType.SET);
    }
  },
  forEach(callback, thisArg) {
    // wrap 函数用来把可代理的值转换为响应式数据
    const wrap = (val) => (typeof val === "object" ? reactive(val) : val);
    // 取得原始对象
    const target = this[RAW];
    // 与ITERATE_KEY建立响应联系
    track(target, ITERATE_KEY);
    // 通过原始数据对象调用 forEach 方法，并把callback 传递过去
    target.forEach((v, k) => {
      // 手动调用callback， 用 wrap 函数包裹 value 和 key 后再传给 callback， 这样就实现了深响应
      callback.call(thisArg, wrap(v), wrap(k), this);
    });
  },
  [Symbol.iterator]: function () {
    return iterationMethod.call(this, Symbol.iterator);
  },
  entries: function () {
    return iterationMethod.call(this, "entries");
  },
  values: function () {
    return iterationMethod.call(this, "values");
  },
  keys: function () {
    return iterationMethod.call(this, "keys");
  },
};

// Symbol.iterator相关方法
function iterationMethod(method) {
  // 获取原始数据对象 target
  const target = this[RAW];
  // 获得原始迭代器的方法
  const itr = target[method]();
  const wrap = (val) =>
    typeof val === "object" && val !== null ? reactive(val) : val;

  // 调用track函数建立响应联系
  track(target, method === "keys" ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);
  return {
    next() {
      const { value, done } = itr.next();
      return {
        value:
          method === Symbol.iterator
            ? value
              ? [wrap(value[0]), wrap(value[1])]
              : value
            : wrap(value),
        done,
      };
    },
    // 实现可迭代协议
    [Symbol.iterator]() {
      return this;
    },
  };
}

function createReactive(obj, { isShallow = false, isReadonly = false } = {}) {
  return new Proxy(obj, {
    // 检查删除属性
    deleteProperty(target, key) {
      if (isReadonly) {
        console.warn(`属性${key}是只读的`);
        return true;
      }
      // 检查被操作的属性是否是对象自己的属性
      const haskey = Object.prototype.hasOwnProperty.call(target, key);
      // 使用Reflect.deleteProperty完成属性的删除
      const res = Reflect.deleteProperty(target, key);
      if (res && haskey) {
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

      // 这里单独处理 Set、Map数据类型
      if (target instanceof Set || target instanceof Map) {
        // 读取size属性时，需要通过指定第三个参数 receiver 为 原始对象 target 从而修复问题
        if (key === "size") {
          track(target, ITERATE_KEY);
          return Reflect.get(target, key, target);
        }
        if (mutableInstrumentations.hasOwnProperty(key)) {
          return mutableInstrumentations[key];
        }
        // 代理Set、Map数据类型方法的正确this，以便正确执行，如delete等方法
        return target[key].bind(target);
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

/**
 * 批量转换 ref 对象
 * @param {} obj 响应式数据
 * @returns
 */
function toRefs(obj) {
  const ret = {};
  // 使用 for ... in 循环遍历对象
  for (const key in obj) {
    // 逐个调用 toRef 完成转换
    ret[key] = toRef(obj, key);
  }
  return ret;
}

/**
 * 代理Ref对象,实现自动脱 ref 的能力
 */
function proxyRefs(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      // 自动脱 ref 实现： 如果读取的值是ref，则返回它的 value 属性值
      return value.__v_isRef ? value.value : value;
    },
    set(target, key, newValue, receiver) {
      // 通过target 读取真实值
      const value = target[key];
      // 如果值是 Ref，则设置其对应的 value 属性值
      if (value.__v_isRef) {
        value.value = newValue;
        return true;
      }
      return Reflect.set(target, key, newValue, receiver);
    },
  });
}

/**
 * toRef 函数
 * @param {} obj 响应式数据
 * @param {} key 响应式数据的 key
 */
function toRef(obj, key) {
  const wrapper = {
    get value() {
      return obj[key];
    },
    set value(val) {
      obj[key] = val;
    },
  };
  // 使用 Object.defineProperty 在 warpper 对象上定义一个不可枚举的属性 __v_isRef，并设置值为 true   (不可枚举、不可写)
  Object.defineProperty(wrapper, "__v_isRef", {
    value: true,
  });
  return wrapper;
}

// ref函数实现
function ref(val) {
  // 包裹基本数据
  const wrapper = {
    value: val,
  };
  // 使用 Object.defineProperty 在 warpper 对象上定义一个不可枚举的属性 __v_isRef，并设置值为 true   (不可枚举、不可写)
  Object.defineProperty(wrapper, "__v_isRef", {
    value: true,
  });
  // 将包裹对象变成响应式数据
  return reactive(wrapper);
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
const obj = reactive({ foo: 11, bar: 2 });
const newObj = proxyRefs({
  ...toRefs(obj),
});

effect(() => {
  console.log(newObj.foo);
});

newObj.foo = 2;
