const fs = require("node:fs");
// 定义状态机状态
const State = {
  initial: 1, // 初始状态
  tagOpen: 2, // 标签开始状态
  tagName: 3, // 标签名称状态
  text: 4, // 文本状态
  tagEnd: 5, // 结束标签状态
  tagEndName: 6, // 结束标签名称状态
};

// 一个辅助函数，用于判断是否是字母
function isAlpha(char) {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
}

// 接收模版字符串作为参数，并将模版切割为 Token 返回
function tokenize(str) {
  // 状态机的当前状态：初始状态
  let currentState = State.initial;
  // 用于缓存字符
  const chars = [];
  // 生成的 Token 会存储到 tokens 数组中，并作为函数的返回值返回
  const tokens = [];
  // 使用 while 循环开启自动机，只要模版字符串没有被消费尽，自动机就会一直运行
  while (str) {
    // 查看第一个字符，注意，这里只是查看，没有消费该字符
    const char = str[0];
    // switch 语句匹配当前状态
    switch (currentState) {
      // 状态机当前处于初始状态
      case State.initial: {
        // 遇到字符 <
        if (char === "<") {
          // 1. 状态机切换到标签开始状态
          currentState = State.tagOpen;
          // 2. 消费字符 <
          str = str.slice(1);
        } else if (isAlpha(char)) {
          // 1. 遇到字母，切换到文本状态
          currentState = State.text;
          // 2. 将当前字母缓存到 chars 数组
          chars.push(char);
          // 3. 消费当前字符
          str = str.slice(1);
        }
        break;
      }
      // 状态机当前处于标签开始状态
      case State.tagOpen: {
        if (isAlpha(char)) {
          // 1. 遇到字母，切换到标签名称状态
          currentState = State.tagName;
          // 2. 将当前字符缓存到 chars 数组
          chars.push(char);
          // 3. 消费当前字符
          str = str.slice(1);
        } else if (char === "/") {
          // 1. 遇到字符 / 切换到结束标签状态
          currentState = State.tagEnd;
          // 2. 消费字符 /
          str = str.slice(1);
        }
        break;
      }
      // 状态机当前处于标签名称状态
      case State.tagName: {
        if (isAlpha(char)) {
          // 1. 遇到字母，由于当前处于标签名称状态，所以不需要切换状态，但需要将当前字符缓存到 chars 数组
          chars.push(char);
          // 2. 消费当前字符
          str = str.slice(1);
        } else if (char === ">") {
          // 1. 遇到字符 >  切换到初始状态
          currentState = State.initial;
          // 2. 同时创建一个标签 Token，并添加到 tokens 数组中，注意，此时chars 数组中缓存到字符就是标签名称
          tokens.push({
            type: "tag",
            name: chars.join(""),
          });
          // 3. chars数组的内容已经被消费，清空它
          chars.length = 0;
          // 4. 同时消费当前字符 >
          str = str.slice(1);
        }
        break;
      }
      // 状态机处于文本状态 TODO：空白行的处理
      case State.text: {
        if (isAlpha(char)) {
          // 1. 遇到字母，保持状态不变，但应该将当前字符缓存到 chars 数组
          chars.push(char);
          // 2. 消费当前字符
          str = str.slice(1);
        } else if (char === "<") {
          // 1. 遇到字符 <  切换到标签开始状态
          currentState = State.tagOpen;
          // 2. 从文本状态 --> 标签开始状态，此时应该创建文本 Token，并添加到 tokens 数组, 注意，此时 chars 数组中的字符就是文本内容
          tokens.push({
            type: "text",
            content: chars.join(""),
          });
          // 3. chars 数组的内容已经被消费，清空它
          chars.length = 0;
          // 4. 消费当前字符
          str = str.slice(1);
        }
        break;
      }
      // 状态机当前处于标签结束状态
      case State.tagEnd: {
        if (isAlpha(char)) {
          // 1. 遇到字母，切换到结束标签名称状态
          currentState = State.tagEndName;
          // 2. 将当前字符缓存到 chars 数组
          chars.push(char);
          // 3. 消费当前字符
          str = str.slice(1);
        }
        break;
      }
      // 状态机当前处于结束标签名称状态
      case State.tagEndName: {
        if (isAlpha(char)) {
          // 1. 遇到字母，状态不变，但需要将当前字符缓存到 chars 数组
          chars.push(char);
          str = str.slice(1);
        } else if (char === ">") {
          // 1. 遇到字符 > , 从结束标签名称状态变更到 初始状态,
          currentState = State.initial;
          // 2. 保存结束标签名称，此时 chars 数组中缓存到内容就是标签名称
          tokens.push({
            type: "tagEnd",
            name: chars.join(""),
          });
          // 3. chars 数组的内容已经被消费，清空它
          chars.length = 0;
          // 4. 消费当前字符
          str = str.slice(1);
        }
        break;
      }
    }
  }
  // 最后返回 tokens
  return tokens;
}

// parse 函数接收模版作为参数
function parse(str) {
  const tokens = tokenize(str);
  // 创建根节点
  const root = {
    type: "Root",
    children: [],
  };
  // 创建 elementStack 栈，起初只有 Root 根节点
  const elementStack = [root];
  // 开启一个 while 循环扫描 tokens，直到所有 Token 都被扫描完毕为止
  while (tokens.length) {
    // 获取当前栈顶节点作为父节点 parent
    const parent = elementStack[elementStack.length - 1];
    // 当前扫描的Token
    const t = tokens.shift();
    switch (t.type) {
      case "tag": {
        // 如果当前 Token 是开始标签，则创建 Element 类型的 AST 节点
        const elementNode = {
          type: "Element",
          tag: t.name,
          children: [],
        };
        parent.children.push(elementNode);
        elementStack.push(elementNode);
        break;
      }
      case "text": {
        const textNode = {
          type: "Text",
          content: t.content,
        };
        parent.children.push(textNode);
        break;
      }
      case "tagEnd": {
        // 遇到结束标签，将栈顶节点弹出
        elementStack.pop();
        break;
      }
    }
  }
  return root;
}

// 转换元素
function transformElement(node, context) {
  // 将转换代码编写在退出阶段的回调函数中，这样可以保证该标签节点全部被处理完毕

  return () => {
    // 如果被转换的节点不是元素节点，则什么都不做
    if (node.type !== "Element") return;

    // 创建 h 函数调用语句， h函数调用的第一个参数是标签名称，因此我们以 node.tag 来创建一个字符串字面量点作为第一个参数
    const callExp = createCallExpression("h", [createStringLiteral(node.tag)]);

    // 处理 h 函数调用的参数
    node.children.length === 1
      ? // 如果当前标签节点只有一个子节点，则直接使用子节点的jsNode作为参数
        callExp.arguments.push(node.children[0].jsNode)
      : // 如果当前标签节点有多个子节点，则创建一个 ArrayExpression 节点作为参数
        callExp.arguments.push(
          createArrayExpression(node.children.map((c) => c.jsNode))
        );
    // 将当前标签节点对应的 JavaScript AST 添加到 jsNode属性下
    node.jsNode = callExp;
  };
}

function transformRoot(node) {
  // 将逻辑编写在退出阶段的回调函数中，保证子节点全部被处理完毕
  return () => {
    if (node.type !== "Root") return;

    // node是根节点，根节点的第一个子节点就是模版的根节点，这里暂时不考虑存在多个根节点的情况
    const vnodeJSAST = node.children[0].jsNode;
    node.jsNode = {
      type: "FunctionDecl",
      id: { type: "Identifier", name: "render" },
      params: [],
      body: [
        {
          type: "ReturnStatement",
          return: vnodeJSAST,
        },
      ],
    };
  };
}

function transformText(node, context) {
  // 如果不是文本节点，则什么都不做
  if (node.type !== "Text") return;
  // 文本节点对应的 JavaScript AST 节点其实就是一个字符串字面量，因此只需要使用 node.content 创建一个 StringLiteral 类型的节点即可，最后将文本节点对应的 JavaScript AST节点添加到 node.jsNode 属性下
  node.jsNode = createStringLiteral(node.content);
}

// transform 函数
function transform(ast) {
  // 在 transform 函数内创建 context 对象
  const context = {
    // 增加 currentNode， 用来存储当前正在转换的节点
    currentNode: null,
    // 增加 childIndex 用来存储当前节点在父节点的 children 中的位置索引
    childIndex: 0,
    // 增加 parent，用来存储当前转换节点的父节点
    parent: null,
    // 用于替换节点的函数，接收新节点作为参数
    replaceNode(node) {
      context.parent.children[context.childIndex] = node;
      context.currentNode = node;
    },
    // 用于删除当前节点
    removeNode() {
      if (context.parent) {
        // 调用数组的 splice 方法，根据当前节点的索引删除当前节点
        context.parent.children.splice(context.childIndex, 1);
        // 将 context.currentNode 置空
        context.currentNode = null;
      }
    },
    // 注册 nodeTransform 数组
    nodeTransforms: [transformElement, transformText],
  };
  // 调用 traverseNode 完成转换
  traverseNode(ast, context);
  // 打印 AST 信息
  dump(ast);
}
// traverseNode 函数
function traverseNode(ast, context) {
  // 当前节点，ast本身就是 Root 节点
  // 设置当前转换的节点信息 context.currentNode
  context.currentNode = ast;
  // 增加退出阶段的回调函数数组
  const exitFns = [];
  // context.nodeTransforms 是一个数组，其中每一个元素都是一个函数
  const transforms = context.nodeTransforms;
  for (let i = 0; i < transforms.length; i++) {
    // 将当前节点 currentNode 和 context 都传递给 nodeTransforms 中注册的回调函数
    const t = transforms[i];
    // 转换函数可以返回另一个函数，该函数即作为退出阶段的回调函数
    const onExit = t(context.currentNode, context);
    if (onExit) {
      exitFns.push(onExit);
    }
    // 由于任何转换函数都可能移除当前节点，因此每个转换函数执行完毕后，都应该检查当前节点是否已经被移除，如果被移除了，直接返回即可
    if (!context.currentNode) return;
  }
  // 如果有子节点，则递归地调用 traverseNode 函数进行遍历
  const children = context.currentNode.children;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      // 递归地调用 traverseNode 转换子节点之前，将当前节点设置为父节点
      context.parent = context.currentNode;
      // 设置位置索引
      context.childIndex = i;
      const node = children[i];
      traverseNode(node, context);
    }
  }

  // 在节点处理的最后阶段执行缓存到exitFns中的回调函数
  // 注意，反序执行
  for (let i = exitFns.length - 1; i >= 0; i--) {
    exitFns[i]();
  }
}
// 编译模版函数
function compile(template) {
  // 模版 AST
  const ast = parse(template);
  transform(ast);
  const code = generate(ast.jsNode);
  return code;
}
// 代码生成器函数
function generate(node) {
  const context = {
    // 存储最终生成的渲染函数代码
    code: "",
    // 在生成代码时，通过调用 push 函数完成代码的拼接
    push(code) {
      context.code += code;
    },
    // 当前缩进的级别，初始值为0，即没有缩进
    currentIndent: 0,
    // 该函数用来换行，即在代码字符串的后面追加 \n 字符，换行时应该保留缩进，所以我们还要追加 currentIndent * 2个空格字符
    newline() {
      context.code += "\n" + `  `.repeat(context.currentIndent);
    },
    // 用来缩进，即让 currentIndent 自增后，调用换行函数
    indent() {
      context.currentIndent++;
      context.newline();
    },
    // 取消缩进，即让 currentIndent 自减后，调用换行函数
    deIndent() {
      context.currentIndent--;
      context.newline();
    },
  };

  // 调用 genNode 函数完成代码生成的工作
  genNode(node, context);
  // 返回渲染函数代码
  return context.code;
}

function genNode(node, context) {}

// FunctionDeclNode 结构
const FunctionDeclNode = {
  // 代表该节点是函数声明
  type: "FunctionDecl",
  id: {
    type: "Identifier",
    name: "render", // name 用来存储标识符的名称，在这里它就是渲染函数名称 render
  },
  params: [], // 参数，目前渲染函数还不需要参数

  // 函数体的内容 return h("div", [h("p", "Vue"), h("p", "Template")]);
  body: [
    {
      type: "ReturnStatement",
      return: {
        type: "CallExpression",
        callee: { type: "Identifier", name: "h" },
        arguments: [
          { type: "StringLiteral", value: "div" },
          {
            type: "ArrayExpression",
            elements: [
              {
                type: "Callexpression",
                callee: { type: "Identifier", name: "h" },
                arguments: [
                  { type: "StringLiteral", value: "p" },
                  { type: "StringLiteral", value: "Vue" },
                ],
              },
              {
                type: "CallExpression",
                callee: { type: "Identifier", name: "h" },
                arguments: [
                  {
                    type: "StringLiteral",
                    value: "p",
                  },
                  { type: "StringLiteral", value: "Template" },
                ],
              },
            ],
          },
        ],
      },
    },
  ],
};

// 用来创建 StringLiteral节点
function createStringLiteral(value) {
  return {
    type: "StringLiteral",
    value,
  };
}

// 用来创建 Identifier 节点
function createIdentifier(name) {
  return {
    type: "Identifier",
    name,
  };
}

// 用来创建 ArrayExpression 节点
function createArrayExpression(elements) {
  return {
    type: "ArrayExpression",
    elements,
  };
}

// 用来创建 CallExpression 节点
function createCallExpression(callee, arguments) {
  return {
    type: "CallExpression",
    callee: createIdentifier(callee),
    arguments,
  };
}

// dump工具函数，用于打印当前AST中节点的信息
function dump(node, indent = 0) {
  // 节点的类型
  const type = node.type;
  // 节点的描述，如果是根节点，则没有描述，如果是 Element 类型的节点，则使用 node.tag 作为节点的描述, 如果是 Text 类型的节点，则使用 node.content 作为节点的描述
  const desc =
    node.type === "Root"
      ? ""
      : node.type === "Element"
      ? node.tag
      : node.content;

  // 打印节点的信息
  console.log(`${"-".repeat(indent)}${type}:${desc}`);
  // 递归调用子节点
  node.children?.forEach((element) => {
    dump(element, indent + 2);
  });
}

const vueTemplate =
  "<div><p><span>Vue</span><span>React</span></p><p>Template</p></div>";

transform(parse(vueTemplate));
