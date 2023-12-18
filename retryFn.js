function fetch() {
  return new Promise((resolve, reject) => {
    // 请求会在1秒后失败
    setTimeout(() => {
      reject("err");
    }, 1000);
  });
}

/**
 * load函数接收一个 onError 回调函数
 * 知识点1: return p.catch(...) 如果是成功的回调，则代码和 return p的返回值一样
 * 知识点2: resolve(p) 如果p是promise对象，则成功的回调是 promise 的
 **/
function load(onError) {
  // 请求接口，得到 Promise 实例
  const p = fetch();
  // 捕获错误
  return p.catch((err) => {
    // 当错误发生时，返回一个新的 Promise 实例，并调用 onError 回调，同时将 retry 函数作为 onError 回调函数的参数
    return new Promise((resolve, reject) => {
      // retry 函数，用来执行重试的函数，执行该函数会重新调用 load 函数并发送请求
      const retry = () => resolve(load(onError));
      const fail = () => reject(err);
      onError(retry, fail);
    });
  });
}

// 重试函数
load((retry, fail) => {
  // 失败后重试
  retry();
}).then((res) => {
  console.log(res);
});
