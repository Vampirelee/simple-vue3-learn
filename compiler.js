// 解析器的不同文本模式，在不同文本模式下，解析到同一个字符时可能有不同的含义
const TextModes = {
  DATA: "DATA",
  RCDATA: "RCDATA",
  RAWTEXT: "RAWTEXT",
  CDATA: "CDATA",
};

// 实体引用表
const namedCharacterReferences = {
  gt: ">",
  "gt;": ">",
  lt: "<",
  "lt;": "<",
  "ltcc;": "⪦",
  // ... 还有其他实体
};
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

// 解析 CDATA
function parseCDATA(context, ancestors) {}

// 解析指令和属性
function parseAttributes(context) {
  const props = [];

  const { advanceBy, advanceSpaces } = context;
  while (!context.source.startsWith(">") && !context.source.startsWith("/>")) {
    // 解析属性和指令

    // 匹配属性名称
    const match = /^[^\t\r\n\f />][^\t\r\n\f />=]*/.exec(context.source);

    const name = match[0];

    // 消费属性名称
    advanceBy(name.length);
    // 消费属性名称和等于号之间的空白
    advanceSpaces();
    // 消费等于号
    advanceBy(1);
    // 消费等于号与属性值之间的空白字符
    advanceSpaces();

    // 属性值
    let value = "";

    // 获取当前模版内容的第一个字符
    const quote = context.source[0];
    // 判断属性值是否被引号引用
    const isQuoted = quote === "'" || quote === '"';
    if (isQuoted) {
      // 消费引号
      advanceBy(1);
      // 获取下一个引号的索引
      const endQuoteIndex = context.source.indexOf(quote);
      if (endQuoteIndex > -1) {
        value = context.source.slice(0, endQuoteIndex);
        // 消费属性值
        advanceBy(value.length);
        // 消费引号
        advanceBy(1);
      } else {
        // 缺少引号错误
        console.error("缺少引号");
      }
    } else {
      // 代码运行到这里，说明属性值没有被引号引用，下一个空白字符之前到内容全部作为属性值
      const match = /^[^\t\r\n\f >]+/.exec(context.source);
      value = match[0];
      advanceBy(value.length);
    }

    advanceSpaces();
    props.push({
      type: "Attribute",
      name,
      value,
    });
  }
  return props;
}

// 解析标签函数
function parseTag(context, type = "start") {
  const { advanceBy, advanceSpaces } = context;

  const match =
    type === "start"
      ? // 匹配开始标签
        /^<([a-z][^\t\r\n\f />]*)/i.exec(context.source)
      : // 匹配结束标签
        /^<\/[a-z][^\t\r\n\f />]*/i.exec(context.source);
  // 匹配成功后，正在表达式的第一个捕获组的值就是标签名称
  const tag = match[1];
  advanceBy(match[0].length);
  // 消费标签中无用的空白字符
  advanceSpaces();

  // 解析vue指令和属性, parseAttribute函数返回数组
  const props = parseAttributes(context);
  // 在消费匹配的内容后，如果字符串以 '/>' 开头，则说明这是一个自闭合标签
  const isSelfClosing = context.source.startsWith("/>");
  // 如果是自闭合标签，则消费 '/>', 否则消费 '>'
  advanceBy(isSelfClosing ? 2 : 1);

  // 返回标签节点
  return {
    type: "Element",
    tag,
    // 添加 props 数组
    props,
    children: [],
    isSelfClosing,
  };
}

/**
 * 解析标签名, 会做三件事，解析开始标签，解析子节点，解析结束标签
 * @param {*} context 上下文对象
 * @param {*} ancestors 祖先节点
 */
function parseElement(context, ancestors) {
  // 解析开始标签
  const element = parseTag(context);
  if (element.isSelfClosing) return element;

  // 切换到正确的文本模式
  if (element.tag === "textarea" || element.tag === "title") {
    context.mode = TextModes.RCDATA;
  } else if (/style|xmp|iframe|nodembed|noframes|noscript/.test(element.tag)) {
    context.mode = TextModes.RAWTEXT;
  } else {
    context.mode = TextModes.DATA;
  }
  ancestors.push(element);
  // 递归地调用 parseChildren 函数进行 <div> 标签子节点的解析
  element.children = parseChildren(context, ancestors);
  ancestors.pop();

  if (context.source.startsWith(`</${element.tag}`)) {
    // 解析结束标签
    parseTag(context, "end");
  } else {
    // 缺少闭合标签
    console.log(`${element.tag} 标签缺少闭合标签`);
  }
  return element;
}

// 解析 {{}} 插值
function parseInterpolation(context) {
  // 消费开始定界符
  context.advanceBy("{{".length);
  // 找到结束定界符的位置索引
  closeIndex = context.source.indexOf("}}");
  if (closeIndex < 0) {
    console.error("插值缺少结束定界符");
  }

  // 截取开始定界符与结束定界符之间的内容作为插值表达式
  const content = context.source.slice(0, closeIndex);
  // 消费表达式的内容
  context.advanceBy(content.length);
  // 消费结束定界符
  context.advanceBy("}}".length);

  // 返回类型为 Interpolation 的节点，代表插值节点
  return {
    type: "Interpolation",
    // 插值节点的 content 是一个类型为 Expression 的表达式节点
    context: {
      type: "Expression",
      // 表达式节点的内容则是经过 HTML 解码后的插值表达式
      content: decodeHtml(content),
    },
  };
}
// 解析文本注释
function parseComment(context) {
  // 消费注释开始部分
  context.advanceBy("<!--".length);
  // 找到注释结束部分的位置索引
  closeIndex = context.source.indexOf("-->");
  // 截取注释节点的内容
  const content = context.source.slice(0, closeIndex);

  // 消费内容
  context.advanceBy(content.length);

  // 消费注释的结束部分
  context.advanceBy("-->".length);
  // 返回类型为 Comment 的节点
  return {
    type: "Comment",
    content,
  };
}

// 解析文本节点
function parseText(context) {
  // endIndex 为文本内容的结尾索引，默认将整个模板剩余内容都作为文本内容
  let endIndex = context.source.length;

  // 寻找字符 < 的位置索引
  const ltIndex = context.source.indexOf("<");
  // 寻找定界符 {{ 的位置索引
  const delimiterIndex = context.source.indexOf("{{");

  if (ltIndex > -1 && ltIndex < endIndex) endIndex = ltIndex;

  if (delimiterIndex > -1 && delimiterIndex < endIndex)
    endIndex = delimiterIndex;

  // 此时 endIndex 是最终的文本内容的结尾索引，调用 slice 函数截取文本内容
  const content = context.source.slice(0, endIndex);
  context.advanceBy(content.length);

  return {
    // 节点类型
    type: "Text",
    content: decodeHtml(content), // 调用 decodeHtml 函数解码内容
  };
}

// 解析实体函数
function decodeHtml(rawText, asAttr = false) {
  let offset = 0;
  const end = rawText.length;
  // 经过解码后的文本将作为返回值被返回
  let decodedText = "";
  // 引用表中实体名称的最大长度
  let maxCRNameLength = 0;

  // advance 函数用于消费指定长度的文本
  function advance(length) {
    offset += length;
    rawText = rawText.slice(length);
  }

  // 消费字符串，直到处理完毕
  while (offset < end) {
    // 用于匹配字符引用的开始部分，如果匹配成功，那么 head[0] 的值将有三种可能
    // 1. head[0] === '&' 该字符引用是命名字符引用
    // 2. head[0] === '&#' 该字符引用是用十进制表示的数字字符引用
    // 2. head[0] === '&#x' 该字符引用是用十六进制表示的数字字符引用
    const head = /&(?:#x?)?/i.exec(rawText);
    if (!head) {
      // 计算剩余内容的长度
      const remaining = end - offset;
      // 将剩余内容加到 decodedText 上
      decodedText += rawText.slice(0, remaining);
      // 消费剩余内容
      advance(remaining);
      break;
    }
    // head.index 为匹配的字符 & 在 rawText 中的位置索引
    // 截取字符 & 之前的内容加到 decodedText 上
    decodeText += rawText.slice(0, head.index);

    // 消费字符 & 之前的内容
    advance(head.index);

    // 如果满足条件，则说明是命名字符引用，否则为数字字符引用
    if (head[0] === "&") {
      let name = "";
      let value;
      // 字符 & 的下一个字符必须是ASCII 字母或数字，这样才是合法的命名字符引用
      if (/[0-9a-z]/i.test(rawText[1])) {
        // 根据引用表计算实体名称的最大长度，
        if (!maxCRNameLength) {
          maxCRNameLength = Object.keys(namedCharacterReferences).reduce(
            (max, name) => Math.max(max, name.length),
            0
          );
        }

        // 从最大长度开始对文本进行截取，并试图去引用表中找到对应的项
        for (let length = maxCRNameLength; !value && length > 0; length--) {
          // 截取字符 & 到最大长度之间的字符作为实体名称
          name = rawText.substr(1, length);
          // 使用实体名称去索引表中查找对应项的值
          value = namedCharacterReferences[name];
        }
        // 如果找到了对应项的值，说明解码成功
        if (value) {
          // 检查实体名称的最后一个匹配字符是否是分号
          const semi = name.endsWith(";");
          // 如果解码的文本作为属性值，最后一个匹配的字符不是分号，并且最后一个匹配字符的下一个字符是等于号、ASCII字母或数字
          // 由于历史原因，将字符 & 和实体名称 name 作为普通文本
          if (
            asAttr &&
            !semi &&
            /[=a-z0-9]/i.test(rawText[name.length + 1] || "")
          ) {
            decodeText += "&" + name;
            advance(1 + name.length);
          } else {
            // 其他情况下，正常使用解码后的内容拼接到 decodedText 上
            decodeText += value;
            advance(1 + name.length);
          }
        } else {
          // 如果字符 & 的下一个字符不是ASCII 字母或数字，则将字符 & 作为普通文本
          decodeText += "&";
          advance(1);
        }
      }
    }
  }

  return decodedText;
}

function parseChildren(context, ancestors) {
  // 定义 nodes 数组存储子节点，它将作为最终的返回值
  let nodes = [];
  // 从上下文对象中取得当前状态
  const { mode } = context;
  while (!isEnd(context, ancestors)) {
    let node;
    if (mode === TextModes.DATA || mode === TextModes.RCDATA) {
      if (mode === TextModes.DATA && context.source[0] === "<") {
        if (context.source[1] === "!") {
          if (context.source.startsWith("<!--")) {
            // 注释
            node = parseComment(context);
          } else if (context.source.startsWith("<![CDATA[")) {
            // CDATA
            node = parseCDATA(context, ancestors);
          }
        } else if (context.source[1] === "/") {
          // 结束标签，这里需要抛出错误，
        } else if (/[a-z]/i.test(context.source[1])) {
          // 标签
          node = parseElement(context, ancestors);
        }
      } else if (context.source.startsWith("{{")) {
        // 解析插值
        node = parseInterpolation(context);
      }
    }
    if (!node) {
      // 解析文本节点
      node = parseText(context);
    }
    nodes.push(node);
  }
  return nodes;
}

function isEnd(context, ancestors) {
  // 当模版内容解析完毕后，停止
  if (!context.source) return true;

  for (let i = ancestors.length - 1; i >= 0; --i) {
    // 获取祖先标签节点（为了更好的提示，这里不找栈顶父级节点做比较）
    const ancestor = ancestors[i];
    // 如果遇到结束标签，并且该标签与父级标签节点同名，则停止
    if (context.source.startsWith(`</${ancestor.tag}`)) return true;
  }
  return false;
}

function parse(str) {
  // 定义上下文对象
  const context = {
    // source 是模版内容，用于在解析过程中进行消费
    source: str,
    // 解析器当前处于文本模式，初始模式为 DATA
    mode: TextModes.DATA,

    // advanceBy 函数用来消费指定数量的字符，它接收一个数字作为参数
    advanceBy(num) {
      // 根据给定字符数 num，截取位置num后的模版内容，并替换当前模版
      context.source = context.source.slice(num);
    },
    // 无论是开始标签还是结束标签，都可能存在无用的空白字符，例如 <div   >
    advanceSpaces() {
      // 匹配空白字符
      const match = /^[\t\r\n\f ]+/.exec(context.source);
      if (match) {
        context.advanceBy(match[0].length);
      }
    },
  };
  // 调用 parseChildren 函数开始进行解析，它返回解析后得到的子节点，接收两个参数。第一个参数上下文对象 context，第二个参数是由父代节点构成的节点栈，初始时栈为空
  const nodes = parseChildren(context, []);

  // 解析器返回 Root 根节点
  return {
    type: "Root",
    children: nodes,
  };
}

// parse 函数接收模版作为参数
/* function parse(str) {
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
} */

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
    nodeTransforms: [transformRoot, transformElement, transformText],
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

function genNode(node, context) {
  switch (node.type) {
    case "FunctionDecl":
      genFunctionDecl(node, context);
      break;
    case "ReturnStatement":
      genReturnStatement(node, context);
      break;
    case "CallExpression":
      genCallExpression(node, context);
      break;
    case "StringLiteral":
      genStringLiteral(node, context);
      break;
    case "ArrayExpression":
      genArrayExpression(node, context);
      break;
  }
}

function genNodeList(nodes, context) {
  const { push } = context;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    genNode(node, context);
    if (i < nodes.length - 1) push(", ");
  }
}
function genFunctionDecl(node, context) {
  const { push, indent, deIndent } = context;
  push(`function ${node.id.name} `);
  push("(");
  genNodeList(node.params, context);
  push(") ");
  push("{");
  indent();
  node.body.forEach((n) => genNode(n, context));
  deIndent();
  push("}");
}
function genReturnStatement(node, context) {
  const { push } = context;
  // 追加 return 关键字和空格
  push("return ");
  // 调用 genNode 函数递归地生成返回值代码
  genNode(node.return, context);
}
function genCallExpression(node, context) {
  const { push } = context;
  const { callee, arguments: args } = node;
  push(`${callee.name}`);
  push("(");
  genNodeList(args, context);
  push(")");
}
function genStringLiteral(node, context) {
  const { push } = context;
  // 对于字符串字面量，只需要追加与 node.value 对应的字符串即可
  push(`"${node.value}"`);
}
function genArrayExpression(node, context) {
  const { push } = context;
  // 追加方括号
  push("[");
  // 调用 genNodeList 为数组元素生成代码
  genNodeList(node.elements, context);
  push("]");
}

// FunctionDeclNode 结构
/* const FunctionDeclNode = {
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
}; */

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

const vueTemplate = `<div><!-- comments --></div>
<div>foo {{ bar }} baz</div>`;

console.log(JSON.stringify(parse(vueTemplate), null, 2));
