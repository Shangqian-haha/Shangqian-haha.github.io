---
title: LangChain 入门：让大模型变成你的「乐高积木」
date: 2026-09-03 14:00:00
categories:
  - 大模型
tags:
  - 大模型
  - LangChain
  - LLM
  - Python
description: 把 LangChain 当成乐高，这篇笔记帮你把六大核心组件、提示词模板、输出解析器串成一条完整的链。
cover: /img/cover-1.svg
---

最近上课讲到 LangChain，老师反复强调一句话：**"LangChain 是给大模型应用做脚手架的"**。一开始我以为又是什么花里胡哨的概念，听完课后自己动手敲了一遍代码，发现它确实把"调大模型"这件本来挺折腾的事，变得像拼乐高一样有章法。

这篇笔记是我自己学习时整理的思路，不抄课件，尽量用大白话讲清楚。

## 一、LangChain 到底是个啥？

你直接调 OpenAI 的 API 也能让大模型回答问题，代码也就三五行：

```python
from openai import OpenAI
client = OpenAI()
r = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "你好"}]
)
print(r.choices[0].message.content)
```

但等你真的想做一个能"连续对话"、能"查自己文档"、能"用工具"的程序时，代码会迅速膨胀到你不想维护。LangChain 就是把这堆脏活累活封装成一组组件，让你像搭积木一样把功能拼起来。

打个比方：**直接调 API 是手擀面，LangChain 是挂面机**。手擀面好吃但费劲，挂面机做的面也还行，关键是省事。

## 二、六大核心组件

LangChain 的"乐高块"主要就这六块。课件上叫它们 M-P-I-Me-C-A，我给你翻译成人话：

| 简写 | 组件 | 它管啥 | 生活化比喻 |
|---|---|---|---|
| **M** | Models（模型） | 调各家大模型的统一接口 | 万能遥控器 |
| **P** | Prompts（提示词模板） | 把提示词做成可复用的模板 | 填空题的题库 |
| **I** | Indexes（数据检索） | 加载文档、切块、向量化、检索 | 图书馆检索系统 |
| **Me** | Memory（记忆） | 让模型记住前几轮对话 | 记事本 |
| **C** | Chains（链） | 把上面这些组件串起来 | 流水线 |
| **A** | Agents（代理） | 让模型自己决定调啥工具 | 私人助理 |

**一个最简单的对话流程**就是这样的：

> 用户输入 → Prompt 模板（套上预设文案）→ LLM → OutputParser（把输出整理成想要的结构）→ 结果

这几步串起来就是一个 Chain。等你把 Indexes、Memory、Agents 都加进去，就变成了能查文档、能记上下文、能用工具的"应用"了。

## 三、用 LangChain 调大模型：3 行代码

我把它简化到最极致的版本：

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-3.5-turbo", api_key="你的key")
print(llm.invoke("什么是 LangChain？").content)
```

跑通这 3 行，你就完成了 50% 的入门工作。剩下的就是把这 3 行嵌进 Chain 里。

## 四、让模型"记住上下文"：Memory

裸调 `invoke()` 的问题是：你问"我叫小明"，再问"我叫什么"，模型会说不知道。

解决办法：把对话历史作为参数传进去：

```python
from langchain_core.messages import HumanMessage, AIMessage

chat_history = []
chat_history.append(HumanMessage(content="我叫小明"))
chat_history.append(llm.invoke(chat_history))  # 模型答："你好小明"
chat_history.append(HumanMessage(content="我叫什么名字？"))
print(llm.invoke(chat_history).content)  # 模型答："你叫小明"
```

原理就是**把历史对话整个塞回 messages 数组**。LangChain 帮你管理这个数组，你不用自己写 `append` 的循环。

> 小坑：对话越长，token 消耗越大；正经做项目会引入"摘要记忆"或"窗口记忆"，不是无限堆。

## 五、提示词模板：填空题题库

"你是一个{role}，请解释{topic}" —— 这种带 `{xxx}` 占位符的就是 Prompt Template。

```python
from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_template(
    "你是一个{role}，请解释{topic}"
)
msg = prompt.format(role="数据科学家", topic="什么是RAG")
print(msg)
# 输出：你是一个数据科学家，请解释什么是RAG
```

这样做的好处：**模板写一次，到处复用**。比如做一个"任意角色 + 任意主题"的解释器，前端传两个字段就行，不用每种组合都手写一个字符串。

## 六、输出解析器：让模型"听话"

大模型的输出默认是一段自由文本，你想让它给 JSON？想给列表？想给特定字段？OutputParser 帮你搞定：

```python
from langchain_core.output_parsers import StrOutputParser, JsonOutputParser

str_parser = StrOutputParser()
result = str_parser.parse(llm.invoke("说一句话").content)  # 纯字符串

json_parser = JsonOutputParser()
data = json_parser.parse(llm.invoke("给我一个{name, age}的JSON").content)
print(data["name"])
```

业务里这点特别有用：你要把模型结果存进数据库/传给前端，**结构化数据**比自由文本好用一百倍。

## 七、向量存储 + RAG：让模型"读你自己的文档"

这块是 LangChain 真正牛的地方。它把"文档加载 → 文本切块 → 向量化 → 存到向量库 → 检索"这条链路全封装了。

**核心流程**：

1. 把 PDF/Markdown 读进来
2. 按段落切成几百字一块
3. 每块用 Embedding 模型变成一组浮点数（向量）
4. 存进 FAISS / Chroma / Milvus 这样的向量库
5. 用户提问时，把问题也变成向量，去库里找"距离最近"的几块
6. 把这几块连同问题一起喂给大模型，让它"参考着"回答

这就是 RAG（检索增强生成）。**大模型不需要训练，只需要给它相关的资料片段**。

具体怎么搭，我下一篇笔记单独写 RAG —— 那个话题够撑一整篇。

## 八、生命周期：开发、生产、部署三件套

课件把 LangChain 的生态分三段：

- **开发阶段**：用 LangChain 的开源组件拼 MVP
- **生产阶段**：用 LangSmith 监控每条链的输入输出、跑分、debug
- **部署阶段**：用 LangServe 把链变成 REST API，挂到服务器上

学生阶段我们基本只碰第一段，但知道有后面这些能少走弯路 —— 以后做项目不愁"上线就崩"。

## 九、学习路径建议

如果你刚入门，按这个顺序走最快：

1. **跑通 invoke()**（10 分钟）—— 先别管框架，把"调用大模型"这件事跑通
2. **加 Memory**（20 分钟）—— 实现"记住上下文的聊天"
3. **用 PromptTemplate**（20 分钟）—— 把提示词参数化
4. **加 OutputParser**（30 分钟）—— 拿到结构化输出
5. **上手 RAG**（1-2 小时）—— 加载文档 + 检索 + 生成

完整过一遍，半天足够了。后面用得到 Agents（自主调用工具）再深入。

## 写在最后

LangChain 本身**不难**，难的是"知道什么时候该用哪个组件"。我自己的经验是：**先想清楚你要解决的业务问题，再去看 LangChain 的哪个组件能帮你**。别反过来"为了用而用"。

下篇写 RAG，把"模型读自己文档"这件事讲透。
