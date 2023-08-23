const { effect, ref } = VueReactivity;

/**
 * 创建渲染器
 */
function createRenderer(options) {
  // 通过 options 得到操作 DOM 的 API
  const { createElement, insert, setElementText, patchProps } = options;
  /**
   * patch函数，挂载或者更新节点
   * @param {} n1 旧node
   * @param {} n2 新node
   * @param {} container 容器
   */
  const patch = (n1, n2, container) => {
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
        mountElement(n2, container);
      } else {
        // 更新节点....
      }
      // 如果 n2 类型是对象，则描述的是组件
    } else if (typeof type === "object") {
    } else {
      console.log("其他情景");
    }
  };

  const mountElement = (vnode, container) => {
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
    insert(el, container);
  };

  // 卸载操作
  const unmount = (vnode) => {
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

const bol = ref(false);

effect(() => {
  // 创建 vnode
  const vnode = {
    type: "div",
    props: bol.value
      ? {
          onclick: () => {
            alert("父元素 clicked");
          },
        }
      : {},
    children: [
      {
        type: "p",
        props: {
          onclick: () => {
            bol.value = !bol.value;
          },
        },
        children: "text",
      },
    ],
  };
  renderer.render(vnode, document.querySelector("#app"));
});
