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
    // 如果 n1(旧node) 不存在， 意味着挂载， 则调用 mountElement 函数完成挂载
    if (!n1) {
      mountElement(n2, container);
    } else {
      // 更新节点....
    }
  };

  const mountElement = (vnode, container) => {
    // 创建 DOM 元素
    const el = createElement(vnode.type);

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
  patchProps(el, key, preValue, value) {
    // 使用 in 操作符判断 key 是否存在对应的 DOM Properties
    if (shouldSetAsProps(el, key, value)) {
      // 使用 shouldSetAsProps 函数判断是否应该作为 DOM Properties 设置
      const type = typeof el[key];
      // 如果是布尔类型，并且 value 是空字符串，则将值矫正为 true
      if (type === "boolean" && value === "") {
        el[key] = true;
      } else {
        el[key] = value;
      }
    } else {
      // 如果要设置的值属性没有对应的 DOM properties， 则使用setAttribute 函数设置
      el.setAttribute(key, value);
    }
  },
});

const vnode = {
  type: "div",
  // 使用 prop 描述一个元素的属性
  props: {
    id: "foo1",
  },
  children: [
    {
      type: "p",
      children: "hello world",
    },
  ],
};

renderer.render(vnode, document.querySelector("#app"));
