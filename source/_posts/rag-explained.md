---
title: RAG 入门：让大模型「带书考试」
date: 2026-09-03 14:30:00
categories:
  - 大模型
tags:
  - 大模型
  - RAG
  - LLM
  - 检索增强生成
  - 向量数据库
description: 把 RAG 比作开卷考试，这篇笔记带你搞懂为什么需要 RAG、向量化到底是个啥、检索生成怎么串起来。
cover: /img/cover_rag-explained.png
---

老师在课上打了个比方，我觉得特别贴切：**普通大模型是闭卷考试，RAG 是开卷考试**。

闭卷考试靠记忆，再聪明的学生也会忘；开卷考试带本参考书，遇到不会的翻一翻。RAG 就是给大模型这本"参考书"。

这篇笔记把 RAG 从概念到流程拆开讲，零基础也能跟上。

## 一、为什么需要 RAG？

大模型再强，也有三个绕不开的问题：

1. **知识不是实时的** —— GPT-4 训练数据有截止日期，问它"昨天欧冠谁赢了"它答不上来
2. **不了解私有知识** —— 你的业务数据、内部文档，训练时压根没碰过
3. **会"幻觉"** —— 一本正经地胡说八道，编造看似合理但完全错误的内容

RAG（Retrieval Augmented Generation，检索增强生成）就是用"检索外部资料 + 让模型参考着回答"来解决这三个问题。

> 举个工作里的例子：让大模型回答"我们公司去年的差旅报销规则"，它肯定不知道。但如果你把差旅手册喂给 RAG，它就能从手册里找到对应条款，再组织成答案给你。

## 二、RAG vs Fine-tuning：检索还是微调？

课件里有个对比表我直接搬过来：

| 维度 | RAG | Fine-tuning |
|---|---|---|
| 原理 | 检索资料 + 让模型参考 | 改模型的内部参数 |
| 数据需求 | 准备文档库 | 准备大量问答对 |
| 成本 | 低（不算 embedding 几乎免费） | 高（GPU + 数据标注） |
| 更新难度 | 加新文档即可 | 要重新训练 |
| 适用场景 | 知识频繁更新、需引用来源 | 任务风格统一、私有化逻辑 |

**简单记忆**：RAG 是"加参考书"，微调是"重新教一遍"。大多数企业场景 RAG 就够了，微调留给"模型要彻底掌握某种风格/逻辑"的少数场景。

## 三、工作流程：索引 + 检索生成

RAG 系统分两阶段。先看一张完整的请求流程图——上面那个虚线框是**离线**只做一次的索引，下面那条线是**每次提问**都会走一遍的检索生成：

![RAG 完整请求流程：上排为离线索引（原始文档 → Embedding → 写入向量数据库），下排为在线检索生成（用户提问 → 向量检索 Top-K → Prompt 拼接 → LLM 生成）](/img/rag-request-flow.png)

### 阶段一：索引（Indexing，提前做）

```
加载文件 → 读取文本 → 文本分割 → 向量化 → 存入向量库
```

把文档喂进系统：
- **加载**：支持 PDF / Word / Markdown / HTML 等等
- **分割**：按段落、句子、字符切成几百字的小块（chunk）
- **向量化**：每块文本变成一组浮点数（向量）
- **入库**：存进向量数据库（如 FAISS、Chroma、Milvus）

这一步**离线**做一次就好，除非文档更新。

### 阶段二：检索 + 生成（Retrieval & Generation，实时做）

```
用户提问 → 问题向量化 → 相似度匹配 → 构建 Prompt → LLM 生成
```

当用户提问时：
1. 把问题也变成向量
2. 去向量库搜"距离最近"的 Top K 个文档块
3. 把这些块 + 用户问题拼成一个 Prompt
4. 喂给大模型，让它"参考着"回答

**这就是 RAG 的全部核心**。别被那些花里胡哨的词吓到。

## 四、向量是什么？Embeddings 是什么？

这可能是最多人卡住的地方，我尽量讲人话。

**向量**：一组浮点数，比如 `[0.12, -0.34, 0.56, ..., 0.78]`（实际可能是 768 维或 1536 维）。

**Embeddings**：把一段文本转成向量的过程/结果。模型叫 Embedding Model，比如 OpenAI 的 `text-embedding-ada-002`。

**关键性质**：语义相近的文本，向量距离更近。

> 举例：
> "今天天气真好" 和 "今天阳光明媚" → 向量距离很近
> "今天天气真好" 和 "中子星是怎么形成的" → 向量距离很远

这就是为什么能用"向量距离"找"语义相似"的文档。

## 五、相似度怎么算？

三种主流算法：

| 名称 | 思路 | 适用场景 |
|---|---|---|
| **欧氏距离** | 两点直线距离 | 直观，但受向量长度影响 |
| **余弦相似度** | 看夹角，忽略长度 | **RAG 最常用** |
| **内积 / 点积** | 各维度相乘求和 | 兼顾方向和大小 |

实际项目里**几乎都用余弦相似度**。记住一句话就够：**夹角越小，文本越像**。

## 六、文档怎么切？四种切法

文档切块是个大学问。常见四种：

1. **按句子切分**：以句号/换行分块，干净但长度不可控
2. **按字符数切分**：固定 N 字一块，简单粗暴可能切在句中
3. **Overlapping Window（重叠窗口）**：每块和上一块重叠 100-200 字，**保上下文连贯**
4. **递归切分**：LangChain 默认的 `RecursiveCharacterTextSplitter`，按段落/句子/词递归切，**推荐**

经验值：每块 200-800 字，重叠 10-20%。太短信息不足，太长检索粒度太粗。

## 七、向量数据库怎么选？

主流四个：

| 数据库 | 特点 | 适合场景 |
|---|---|---|
| **Chroma** | 轻量、Python 友好 | 快速原型、本地开发 |
| **FAISS** | Meta 开源、性能强 | 研究场景、本地部署 |
| **Milvus** | 分布式、毫秒级万亿向量 | 大规模生产 |
| **Pinecone** | 全托管、按量付费 | 不想运维 |

**学生阶段选 Chroma**，一个 `pip install` 就能跑。生产环境用 Milvus。

```bash
pip install chromadb
```

```python
import chromadb
client = chromadb.Client()  # 内存模式
collection = client.create_collection("my_docs")
collection.add(documents=["xxx", "yyy"], ids=["1", "2"])
results = collection.query(query_texts=["查询"], n_results=2)
```

## 八、混合检索：BM25 + 向量

课件上提到了"混合检索"——把**传统关键词搜索（BM25）** 和 **向量语义搜索** 结合起来。

为啥？纯向量检索对"精确关键词"不敏感（比如产品编号、专业术语）。把 BM25 当作兜底，两者分数加权融合，效果更稳。

这是进阶话题，初学先跳过，知道有这回事就行。

## 九、平台实战

实际做项目时你不一定从零搭，国内几个平台都提供了开箱即用的 RAG：

- **阿里云百炼**：上传数据 → 自动建索引 → API 调用
- **智谱 BigModel**：内置知识库管理，HTTP 接口
- **ModelScope / HuggingFace**：开源模型 + 社区 RAG pipeline

> 个人看法：学习阶段手写一遍流程，工作中直接用平台，能省一周工作量。

## 十、一个最简 RAG 代码骨架

```python
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import FAISS

# 1. 加载文档
docs = TextLoader("knowledge.txt").load()

# 2. 切块
splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
chunks = splitter.split_documents(docs)

# 3. 向量化 + 存 FAISS
vectordb = FAISS.from_documents(chunks, OpenAIEmbeddings())

# 4. 检索 + 生成
retriever = vectordb.as_retriever()
query = "公司的差旅住宿标准是什么？"
relevant = retriever.invoke(query)
context = "\n".join([d.page_content for d in relevant])

prompt = f"参考以下资料回答问题：\n{context}\n\n问题：{query}"
llm = ChatOpenAI(model="gpt-3.5-turbo")
print(llm.invoke(prompt).content)
```

读懂这段，你就掌握了 80% 的 RAG 实战。

## 写在最后

RAG 不神秘，核心就三件事：**把文档变向量、把问题变向量、找最近的喂给模型**。

但工程上有很多坑：chunk 怎么切、Embedding 怎么选、Top K 取多少、Prompt 怎么拼——这些细节要靠项目积累。

下一步准备用 Chroma + LangChain 搭一个能查自己笔记的 RAG 助手，到时候把踩坑记录写出来。
