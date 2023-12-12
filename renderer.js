const { effect, ref, reactive } = VueReactivity;

// 文本节点的标识
const Text = Symbol("Text vnode");
// 注释节点标识
const Comment = Symbol("Text comment");
// Fragment 节点标识
const Fragment = Symbol("Fragment");

// 任务缓存队列，用一个 Set 数据结构来表示，这样就可以自动对任务进行去重
const queue = new Set();
// 一个标志，代表是否正在刷新任务队列
let isFlushing = false;
const p = Promise.resolve();

// 调度器的主要函数，用来将一个任务添加到缓冲队列中，并开始刷新队列
function queueJob(job) {
  // 将 job 添加到任务队列 queue 中
  queue.add(job);
  // 如果还没有开始刷新队列，则刷新之
  if (!isFlushing) {
    // 将该标志设置为true，以避免重复刷新
    isFlushing = true;
    // 在微任务中刷新缓冲队列
    p.then(() => {
      try {
        // 执行任务队列中的任务
        queue.forEach((job) => job());
      } finally {
        // 重置状态
        isFlushing = false;
        queue.clear();
      }
    });
  }
}

/**
 * 创建渲染器
 */
function createRenderer(options) {
  // 通过 options 得到操作 DOM 的 API
  const {
    createElement,
    insert,
    setElementText,
    createText,
    setText,
    patchProps,
  } = options;
  /**
   * patch函数，挂载或者更新节点
   * @param {} n1 旧node
   * @param {} n2 新node
   * @param {} container 容器
   */
  const patch = (n1, n2, container, anchor) => {
    // 如果新旧vnode的类型不同(这里先简单把类型理解为 HTML 标签、组件、Fragment 等)，则直接将旧vnode卸载
    if (n1 && n1.type !== n2.type) {
      unmount(n1);
      n1 = null;
    }
    // 代码运行到这里，证明 n1 和 n2 的类型相同
    const { type } = n2;
    // 如果 n2 类型是字符串，则描述的是普通标签元素
    if (typeof type === "string") {
      // 如果 n1(旧node) 不存在， 意味着挂载， 则调用 mountElement 函数完成挂载
      if (!n1) {
        mountElement(n2, container, anchor);
      } else {
        patchElement(n1, n2);
      }
    } else if (type === Text) {
      // 如果新 vnode 的类型是Text， 则说明 vnode 描述的是文本节点
      // 如果没有旧节点，则进行挂载
      if (!n1) {
        // 使用createTextNode 创建文本节点
        const el = (n2.el = createText(n2.children));
        // 将文本节点插入到容器
        insert(el, container);
      } else {
        // 如果旧 vnode 存在，只需要使用新文本节点的文本内容更新旧文本节点即
        const el = (n2.el = n1.el);
        if (n2.children !== n1.children) {
          // 调用 setText 函数更新文本节点的内容
          setText(el, n2.children);
        }
      }
    } else if (type === Fragment) {
      // 处理Fragment 类型的 vnode
      if (!n1) {
        // 如果旧 vnode 不存在，则只需要将 Fragment 的children 逐个挂载即可
        n2.children.forEach((c) => patch(null, c, container));
      } else {
        // 如果旧 vnode 存在，则只需要更新 Fragment 的children即可
        patchChildren(n1, n2, container);
      }
    }
    // 如果 n2 类型是对象，则描述的是组件
    else if (typeof type === "object") {
      // vnode.type 的值是选项对象，作为组件来处理
      if (!n1) {
        // 挂载组件
        mountComponent(n2, container, anchor);
      } else {
        // 更新组件
        patchComponent(n1, n2, container);
      }
    } else {
      console.log("其他情景");
    }
  };

  const mountElement = (vnode, container, anchor) => {
    // 创建 DOM 元素
    const el = (vnode.el = createElement(vnode.type));

    // 处理子节点，如果子节点是字符串，代表元素具有文本节点
    if (typeof vnode.children === "string") {
      // 因此只需要设置元素的 textContent 属性即可
      setElementText(el, vnode.children);
    } else if (Array.isArray(vnode.children)) {
      // 如果children 是数组， 则遍厉每一个子节点，并调用 patch 函数挂载它们
      vnode.children.forEach((child) => {
        patch(null, child, el);
      });
    }
    // 如果 vnode.props 存在才处理它
    if (vnode.props) {
      // 遍历 vnode.props
      for (const key in vnode.props) {
        patchProps(el, key, null, vnode.props[key]);
      }
    }
    // 将元素添加到容器中
    insert(el, container, anchor);
  };

  // 挂载组件
  const mountComponent = (vnode, container, anchor) => {
    // 通过 vnode 获取组件的选项对象，即 vnode.type
    const componentOptions = vnode.type;
    // 获取组件的渲染函数 render 及生命周期函数
    const {
      render,
      data,
      beforeCreate,
      created,
      beforeMount,
      mounted,
      beforeUpdate,
      updated,
    } = componentOptions;
    // 这里调用 beforeCreate 钩子
    beforeCreate && beforeCreate();
    // 调用 data 函数得到原始数据，并调用 reactive 函数将其包装为响应式数据
    const state = reactive(data());
    // 定义组件实例，一个组件实例本质上就是一个对象，它包含与组件有关的状态信息
    const instance = {
      // 组件自身的状态数据，即 data
      state,
      // 一个布尔值，用来表示组件是否已经被挂载，初始值为 false
      isMounted: false,
      // 组件所渲染的内容，即子树 subTree
      subTree: null,
    };
    // 将组件实例设置到 vnode 上，用于后续更新
    vnode.component = instance;

    // 在这里调用 created 钩子
    created && created();

    // 将组件的 render 函数调用包装到 effect 内
    effect(
      () => {
        // 调用组件的渲染函数，获得子树
        const subTree = render.call(state, state);
        // 检查组件是否已经被挂载
        if (!instance.isMounted) {
          // 这里调用 beforeMount 钩子
          beforeMount && beforeMount.call(state);

          // 初次挂载，调用 patch 函数第一个参数传递 null
          patch(null, subTree, container, anchor);
          // 重点： 将组件实例的 isMounted 设置为true，这样当更新发生时就不会再次进行挂载操作，而是会执行更新
          instance.isMounted = true;
          // 在这里调用 mounted 钩子
          mounted && mounted.call(state);
        } else {
          // 在这里调用 beforeUpdate 钩子
          beforeUpdate && beforeUpdate.call(state);
          // 当 isMountd 为true时，说明组件已经被挂载，只需要完成自更新即可，
          // 所以在调用 patch 函数时，第一个参数为组件上一次渲染的子树，意思是使用新的子树与上一次渲染的子树进行补丁操作
          patch(instance.subTree, subTree, container, anchor);
          // 在这里调用 updated 钩子
          updated && updated.call(state);
        }
        // 更新组件实例的子树
        instance.subTree = subTree;
      },
      {
        // 指定该副作用函数的调度器为 queueJob 即可
        scheduler: queueJob,
      }
    );
  };

  // 简单diff算法
  const patchKeyedChildren1 = (n1, n2, container) => {
    // 先将旧的子节点全部卸载掉，然后再添加新的子节点
    const oldChildren = n1.children;
    const newChildren = n2.children;

    // 用来存储寻找过程中遇到的最大索引值
    let lastIndex = 0;
    for (let i = 0; i < newChildren.length; i++) {
      const newVNode = newChildren[i];
      // 在第一层循环体中定义变量find，代表是否在旧的一组子节点中找到可服用的节点
      let find = false;
      for (let j = 0; j < oldChildren.length; j++) {
        const oldVNode = oldChildren[j];
        // 如果找到了具有相同 key 值的两个节点，说明可以复用(怎么理解复用？不重新卸载和挂载元素，而只是移动DOM元素的位置)，但仍然需要调用 patch 函数更新
        if (
          "key" in newVNode &&
          "key" in oldVNode &&
          newVNode.key === oldVNode.key
        ) {
          // 一旦找到可复用的节点，赋值 find
          find = true;
          // patch只是更新新旧节点的相关变化的属性等，但是真实 DOM 元素的顺序还是按照旧子节点的顺序排布，故后面需要更新其位置信息
          patch(oldVNode, newVNode, container);
          if (j < lastIndex) {
            // 如果当前找到的节点在旧 children 中的索引小于最大索引值 lastIndex, 说明该节点的真实DOM需要移动
            // 先获取 newVNode 的前一个 vnode， 即 prevVNode
            const prevVNode = newChildren[i - 1];
            if (prevVNode) {
              // 由于我们要将 newVNode 对应的真实 DOM 移动到 prevVNode 所对应的真实 DOM 后面， 所以我们需要获取 prevVNode 所对应的真实DOM的下一个兄弟节点，并将其作为锚点
              const anchor = prevVNode.el.nextSibling;
              // 调用 insert 方法将 newVNode 对应的真实 DOM 插入到锚点元素前面，也就是 prevVNode 对应的真实 DOM 后面
              insert(newVNode.el, container, anchor);
            }
          } else {
            // 如果当前找到的节点在旧 children 中的索引不小于最大索引值，则更新 lastIndex 的值
            lastIndex = j;
          }
          break;
        }
      }
      // 如果代码运行到这里， find 仍然为 false，说明当前 newVNode 没有在旧的一组节点中找到可复用的节点，即这个节点是新增的节点，需要挂载
      if (!find) {
        // 为了将节点挂载到正确的位置，我们需要先获取锚点元素，即当前 newVNode 节点的前一个节点
        const prevVNode = newChildren[i - 1];
        let anchor;
        if (prevVNode) {
          anchor = prevVNode.el.nextSibling;
        } else {
          // 没有，说明是第一个 vnode 节点 ，这是使用容器元素的 firstChild 作为锚点
          anchor = container.firstChild;
        }

        // 挂载 newVNode
        patch(null, newVNode, container, anchor);
      }
    }

    // 上面程序完成后，需要再次遍厉一边旧的子节点，找出旧节点存在但新节点不存在的节点
    for (let i = 0; i < oldChildren.length; i++) {
      const oldVNode = oldChildren[i];
      // 拿旧节点 oldVNode 去新的一组子节点中寻找具有相同 key 值的节点
      const has = newChildren.find(
        (vnode) =>
          "key" in vnode && "key" in oldVNode && vnode.key === oldVNode.key
      );
      if (!has) {
        // 如果没有找到具有相同 key 值的节点，则说明需要删除该节点，调用 unmount 函数将其卸载
        unmount(oldVNode);
      }
    }
  };

  // 双端diff算法
  const patchKeyedChildren2 = (n1, n2, container) => {
    const oldChildren = n1.children;
    const newChildren = n2.children;
    // 四个索引值
    let oldStartIdx = 0;
    let oldEndIdx = oldChildren.length - 1;
    let newStartIdx = 0;
    let newEndIdx = newChildren.length - 1;
    // 四个索引值指向 vnode 节点
    let oldStartVNode = oldChildren[oldStartIdx];
    let newStartVNode = newChildren[newStartIdx];
    let oldEndVNode = oldChildren[oldEndIdx];
    let newEndVNode = newChildren[newEndIdx];

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      // 如果 旧节点的首尾节点 是 undefined，说明已经在最后一个分支处理过了，更新它们即可
      if (!oldEndVNode) {
        oldEndVNode = oldChildren[--oldEndIdx];
      } else if (!oldStartVNode) {
        oldStartVNode = oldChildren[++oldStartIdx];
      } else if (oldStartVNode.key === newStartVNode.key) {
        // 节点在新的顺序中仍然处于头部，不需要移动，但仍然需要打补丁
        patch(oldStartVNode, newStartVNode, container);
        oldStartVNode = oldChildren[++oldStartIdx];
        newStartVNode = newChildren[++newStartIdx];
      } else if (oldEndVNode.key === newEndVNode.key) {
        // 节点在新的顺序中仍然处于尾部，不需要移动，但仍然需要打补丁
        patch(oldEndVNode, newEndVNode, container);
        oldEndVNode = oldChildren[--oldEndIdx];
        newEndVNode = newChildren[--newEndIdx];
      } else if (oldStartVNode.key === newEndVNode.key) {
        // 仍然需要调用 patch 函数进行打补丁
        patch(oldStartVNode, newEndVNode, container);
        // 移动DOM操作，将 oldStartVNode.el 移动 到 oldEndVNode.el后面
        insert(oldStartVNode.el, container, oldEndVNode.el.nextSibling);
        // 移动完后更新索引值
        oldStartVNode = oldChildren[++oldStartIdx];
        newEndVNode = newChildren[--newEndIdx];
      } else if (oldEndVNode.key === newStartVNode.key) {
        // 仍然需要调用 patch 函数进行打补丁
        patch(oldEndVNode, newStartVNode, container);
        // 移动 DOM 操作, 将 oldEndVNode.el 移动到 oldStartVNode.el前面
        insert(oldEndVNode.el, container, oldStartVNode.el);
        // 移动完后，更新索引值
        oldEndVNode = oldChildren[--oldEndIdx];
        newStartVNode = newChildren[++newStartIdx];
      } else {
        // 遍历旧的一组子节点，试图寻找与newStartVNode 拥有相同 key 值的节点， idxInOld 就是新的一组子节点的头部节点在旧的一组子节点中的索引
        const idxInOld = oldChildren.findIndex(
          (node) => node.key === newStartVNode.key
        );
        if (idxInOld > 0) {
          // idxInOld 位置对应的 vnode 就是需要移动的节点
          const vnodeToMove = oldChildren[idxInOld];
          // 进行打补丁操作
          patch(vnodeToMove, newStartVNode, container);
          // 将 idxInOld位置对应的元素移动到开始节点处
          insert(vnodeToMove.el, container, oldStartVNode.el);
          // 由于 idxInOld 处节点对应的真实节点移动到了其他地方，因此需要将这里设置为 undefiend
          oldChildren[idxInOld] = void 0;
        } else {
          // 挂载新的节点到oldStartIdx前面的位置
          patch(null, newStartVNode, container, oldStartVNode.el);
        }
        // 更新 newStartIdx 的值
        newStartVNode = newChildren[++newStartIdx];
      }
    }
    // 循环结束后检查索引值的情况
    if (oldEndIdx < oldStartIdx && newStartIdx <= newEndIdx) {
      for (let i = newStartIdx; i <= newEndIdx; i++) {
        const vnode = newChildren[i];
        patch(null, vnode, container, oldStartVNode.el);
      }
    }
    // 旧节点存在，新节点不存在的情况
    else if (newEndIdx < newStartIdx && oldStartIdx <= oldEndIdx) {
      for (let i = oldStartIdx; i <= oldEndIdx; i++) {
        const vnode = oldChildren[i];
        if (vnode) unmount(vnode);
      }
    }
  };

  // 快速diff算法
  const patchKeyedChildren = (n1, n2, container) => {
    const oldChildren = n1.children;
    const newChildren = n2.children;
    // 处理相同的前置节点，索引 j 指向了新旧两组子节点的开头
    let j = 0;
    let oldVNode = oldChildren[j];
    let newVNode = newChildren[j];
    // while 循环向后遍厉，直到遇到拥有不同的 key 值的节点为止
    while (oldVNode.key === newVNode.key) {
      // 调用 patch 函数进行更新
      patch(oldVNode, newVNode, container);
      oldVNode = oldChildren[++j];
      newVNode = newChildren[++j];
    }
    // 更新相同的后置节点
    // 索引 oldEnd 指向旧的一组子节点的最后一个节点
    let oldEnd = oldChildren.length - 1;
    // 索引 newEnd 指向新的一组子节点的最后一个节点
    let newEnd = newChildren.length - 1;
    oldVNode = oldChildren[oldEnd];
    newVNode = newChildren[newEnd];
    // while 向后遍历，直到遇到不同的 key值的节点为止
    while (oldVNode.key === newVNode.key) {
      // 调用 patch 函数进行更新
      patch(oldVNode, newVNode, container);
      oldVNode = oldChildren[--oldEnd];
      newVNode = newChildren[--newEnd];
    }

    // 预处理完毕后，如果满足如下条件，则说明从 j --> newEnd 之间的节点应作为新节点插入
    if (j > oldEnd && j <= newEnd) {
      // 锚点点索引
      const anchorIndex = newEnd + 1;
      // 锚点元素
      const anchor =
        anchorIndex < newChildren.length ? newChildren[anchorIndex].el : null;
      // 采用 while 循环，调用 patch 函数逐个挂载新增节点
      while (j <= newEnd) {
        patch(null, newChildren[j++], container, anchor);
      }
    } else if (j > newEnd && j <= oldEnd) {
      // j -> oldEnd 之间的节点应该被卸载
      while (j <= oldEnd) {
        unmount(oldChildren[j++]);
      }
    } else {
      // 其他情况
      const count = newEnd - j + 1;
      const source = new Array(count);
      source.fill(-1);

      // 新增两个变量 moved 和 pos
      let moved = false;
      let pos = 0;

      // oldStart 和 newStart 分别为起始索引，即 j
      const oldStart = j;
      const newStart = j;

      // 构建索引表
      const keyIndex = {};
      for (let i = newStart; i <= newEnd; i++) {
        keyIndex[newChildren[i].key] = i;
      }
      // 新增 patched 变量，代表更新过的节点数量
      let patched = 0;
      // 遍历旧的一组子节点中剩余未处理的节点
      for (let i = oldStart; i <= oldEnd; i++) {
        oldVNode = oldChildren[i];
        // 如果更新过的节点数量小于等于需要更新的节点数量，则执行更新
        if (patched <= count) {
          // 通过索引表快速找到新的一组子节点中具有相同 key 值的节点位置
          const k = keyIndex[oldVNode.key];
          if (typeof k !== "undefined") {
            newVNode = newChildren[k];
            // 调用 patch 进行更新
            patch(oldVNode, newVNode, container);
            // 每更新一个节点，都将 patched 变量 +1
            patched++;
            // 最后填充 source 数组
            source[k - newStart] = i;
            // 判断节点是否需要移动
            if (k < pos) {
              moved = true;
            } else {
              pos = k;
            }
          } else {
            // 没找到
            unmount(oldVNode);
          }
        } else {
          // 如果更新过的节点数量大于需要更新的节点数量，则卸载多余的节点
          unmount(oldVNode);
        }
      }

      // 需要进行DOM移动操作
      if (moved) {
        const seq = lis(source);
        // s 指向最长递增子序列的最后一个元素
        let s = seq.length - 1;
        // i 指向新的一组子节点的最后一个元素
        let i = count - 1;
        // for  循环使得 i 递减
        for (i; i >= 0; i--) {
          if (source[i] === -1) {
            // 说明索引为 i 的节点是全新的节点，应该将其挂载，该节点在新 children 中的真实位置索引
            const pos = i + newStart;
            const newVNode = newChildren[pos];
            // 该节点的下一个节点的位置索引
            const nextPos = pos + 1;
            // 锚点
            const anchor =
              nextPos < newChildren.length ? newChildren[nextPos].el : null;
            patch(null, newVNode, container, anchor);
          } else if (i !== seq[s]) {
            // 如果节点的索引 i 不等于 seq[s] 的值，说明该节点需要移动
            // 在节点新的一组子节点中的真实位置索引
            const pos = i + newStart;
            const newVNode = newChildren[pos];
            // 该节点的下一个节点的位置索引
            const nextPos = pos + 1;
            // 锚点
            const anchor =
              nextPos < newChildren.length ? newChildren[nextPos].el : null;
            insert(newVNode.el, container, anchor);
          } else {
            // 当 i === seq[s] 时，说明该位置的节点不需要移动，只需要让s指向下一个位置
            s--;
          }
        }
      }
    }
  };

  // 计算某个数字数组最长递增子序列，返回该子序列的索引值数组
  const lis = (arr) => {
    const p = arr.slice();
    const result = [0];
    let i, j, u, v, c;
    const len = arr.length;
    for (i = 0; i < len; i++) {
      const arrI = arr[i];
      if (arrI !== 0) {
        j = result[result.length - 1];
        if (arr[j] < arrI) {
          p[i] = j;
          result.push(i);
          continue;
        }
        u = 0;
        v = result.length - 1;
        while (u < v) {
          c = ((u + v) / 2) | 0;
          if (arr[result[c]] < arrI) {
            u = c + 1;
          } else {
            v = c;
          }
        }
        if (arrI < arr[result[u]]) {
          if (u > 0) {
            p[i] = result[u - 1];
          }
          result[u] = i;
        }
      }
    }
    u = result.length;
    v = result[u - 1];
    while (u-- > 0) {
      result[u] = v;
      v = p[v];
    }
    return result;
  };

  const patchChildren = (n1, n2, container) => {
    // 判断新子节点的类型是否是文本节点
    if (typeof n2.children === "string") {
      // 旧子节点有三种可能，没有子节点、文本子节点以及一组子节点
      // 只有当旧子节点为一组子节点时，才需要逐个卸载，其他情况什么都不需要
      if (Array.isArray(n1.children)) {
        n1.children.forEach((c) => unmount(c));
      }
      // 最后将新的文本节点内容设置给容器元素
      setElementText(container, n2.children);
    } else if (Array.isArray(n2.children)) {
      if (Array.isArray(n1.children)) {
        // 新旧节点都是一组子节点，此处逻辑为核心逻辑
        patchKeyedChildren(n1, n2, container);
      } else {
        // 新节点为一组子节点，旧节点为文本节点或没有
        setElementText(container, "");
        n2.children.forEach((c) => patch(null, c, container));
      }
    } else {
      // 新的子节点不存在
      if (Array.isArray(n1)) {
        n1.children.forEach((c) => unmount(c));
      } else if (typeof n1 === "string") {
        setElementText(container, "");
      }
    }
  };

  const patchElement = (n1, n2) => {
    const el = (n2.el = n1.el);
    const oldProps = n1.props;
    const newProps = n2.props;
    // 第一步： 更新 props
    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProps(el, key, oldProps[key], newProps[key]);
      }
    }
    // 考虑旧节点有，新节点没有的情况
    for (const key in oldProps) {
      if (!(key in newProps)) {
        patchProps(el, key, oldProps[key], newProps[key]);
      }
    }
    // 更新 children
    patchChildren(n1, n2, el);
  };

  // 卸载操作
  const unmount = (vnode) => {
    if (vnode.type === Fragment) {
      vnode.children.forEach((c) => unmount(c));
    }
    const parent = vnode.el.parentNode;
    if (parent) {
      parent.removeChild(vnode.el);
    }
  };

  const render = (vnode, container) => {
    if (vnode) {
      // 新vnode存在，将其与旧 vnode 一起传递给 patch 函数，进行打补丁
      patch(container._vnode, vnode, container);
    } else {
      if (container._vnode) {
        // 旧 vnode 存在，且新 vnode 不存在，说明是卸载操作，只需卸载
        unmount(container._vnode);
      }
    }
    // 把vnode存储到 container._vnode下，即后续渲染中的旧的 vnode
    container._vnode = vnode;
  };
  return { render };
}

/**
 * prop是否应该被设置（有些html标签的属性是只读的）
 * @param {*} el
 * @param {*} key
 * @param {*} value
 */
const shouldSetAsProps = (el, key, value) => {
  // 特殊处理
  if (key === "form" && el.tagName === "INPUT") return false;
  return key in el;
};

const renderer = createRenderer({
  createElement(tag) {
    return document.createElement(tag);
  },
  // 用于设置元素的文本节点
  setElementText(el, text) {
    el.textContent = text;
  },
  // 用于在给定的 parent 下添加指定元素
  insert(el, parent, anchor = null) {
    parent.insertBefore(el, anchor);
  },
  // 创建文本节点
  createText(text) {
    return document.createTextNode(text);
  },
  // 设置文本节点
  setText(el, text) {
    el.nodeValue = text;
  },
  patchProps(el, key, prevValue, nextValue) {
    // 匹配以 on 开头的属性， 视为事件
    if (/^on/.test(key)) {
      // 获取为该元素伪造的事件处理函数 invoker （vei是 vue event invoker的首字母缩写）
      const invokers = el._vei || (el._vei = {});
      let invoker = invokers[key];
      // 根据属性名称得到对应的事件名称，例如 onClick ---->  click
      const name = key.slice(2).toLowerCase();
      if (nextValue) {
        if (!invoker) {
          // 如果没有 invoker，则将一个伪造的 invoker 缓存到 el._vei中
          invoker = el._vei[key] = (e) => {
            // 如果事件发生的时间早于事件处理函数绑定的事件，则不执行事件处理函数
            if (e.timeStamp < invoker.attached) return;
            // 如果 invoker.value是数组，则遍历它并逐个调用事件处理函数
            if (Array.isArray(invoker.value)) {
              invoker.value.forEach((fn) => fn(e));
            } else {
              // 否则直接调用
              invoker.value(e);
            }
          };
          // 将真正的事件处理函数赋值给 invoker.value
          invoker.value = nextValue;
          // 添加 invoker.attached属性， 存储事件处理函数被绑定的时间
          invoker.attached = performance.now();
          // 绑定 invoker 作为事件处理函数
          el.addEventListener(name, invoker);
        } else {
          // 如果 invoker 存在，意味着更新，并且只需要更新 invoker.value 的值即可
          invoker.value = nextValue;
        }
      } else if (invoker) {
        // 新的事件绑定函数不存在，且之前绑定的 invoker 存在，则移除绑定
        el.removeEventListener(name, invoker);
      }
    }
    // 对 class 类进行特殊处理（el.className、setAttribute 和 el.classList这三个方法都可以设置HTML的class属性，但经过测试 el.className性能最优）
    else if (key === "class") {
      el.className = nextValue || "";
    }
    // 使用 in 操作符判断 key 是否存在对应的 DOM Properties
    else if (shouldSetAsProps(el, key, nextValue)) {
      // 使用 shouldSetAsProps 函数判断是否应该作为 DOM Properties 设置
      const type = typeof el[key];
      // 如果是布尔类型，并且 nextValue 是空字符串，则将值矫正为 true
      if (type === "boolean" && nextValue === "") {
        el[key] = true;
      } else {
        el[key] = nextValue;
      }
    } else {
      // 如果要设置的值属性没有对应的 DOM properties， 则使用setAttribute 函数设置
      el.setAttribute(key, nextValue);
    }
  },
});

const MyComponent = {
  name: "MyComponent",
  data() {
    return {
      foo: "hello world",
    };
  },
  render() {
    return {
      type: "div",
      props: {
        onClick: () => {
          console.log(1);
          this.foo = "hello world 11";
        },
      },
      // 在渲染函数内使用组件状态
      children: `foo 的值是：${this.foo}`,
    };
  },
};

effect(() => {
  // 创建 vnode

  renderer.render({ type: MyComponent }, document.querySelector("#app"));
});
