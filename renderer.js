const { effect, ref } = VueReactivity;

// 文本节点的标识
const Text = Symbol("Text vnode");
// 注释节点标识
const Comment = Symbol("Text comment");
// Fragment 节点标识
const Fragment = Symbol("Fragment");

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
            if (newVNode.key === oldVNode.key) {
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
          const has = newChildren.find((vnode) => vnode.key === oldVNode.key);
          if (!has) {
            // 如果没有找到具有相同 key 值的节点，则说明需要删除该节点，调用 unmount 函数将其卸载
            unmount(oldVNode);
          }
        }
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

const vnode = ref({
  type: "div",
  children: [
    {
      type: "p",
      children: "1",
      key: 1,
    },
    {
      type: "p",
      children: "2",
      key: 2,
    },
    {
      type: "p",
      children: "hello",
      key: 3,
    },
  ],
});

effect(() => {
  // 创建 vnode

  renderer.render(vnode.value, document.querySelector("#app"));
});

setTimeout(() => {
  vnode.value = {
    type: "div",
    children: [
      {
        type: "p",
        children: "new n11ode",
        key: 4,
      },
      {
        type: "p",
        children: "world",
        key: 3,
      },
      {
        type: "p",
        children: "2",
        key: 2,
      },
    ],
  };
}, 1000);
