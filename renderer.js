const { effect, ref } = VueReactivity;

/**
 * 创建渲染器
 */
function createRenderer() {
  const render = (vnode, container) => {
    if (vnode) {
      // 新vnode存在，将其与旧 vnode 一起传递给 patch 函数，进行打补丁
      patch(container._vnode, vnode, container);
    } else {
      if (container._vnode) {
        // 旧 vnode 存在，且新 vnode 不存在，说明是卸载操作，只需要将 container 内的 DOM 清空即可
        container.innerHTML = "";
      }
    }
    // 把vnode存储到 container._vnode下，即后续渲染中的旧的 vnode
    container._vnode = vnode;
  };
  return { render };
}

/**
 * patch函数
 * @param {} n1 旧node
 * @param {} n2 新node
 * @param {} container 容器
 */
function patch(n1, n2, container) {}
