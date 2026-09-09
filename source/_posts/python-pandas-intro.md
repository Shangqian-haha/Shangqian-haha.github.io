---
title: Python 数据分析入门：从 Pandas 开始
date: 2026-08-23 21:00:00
categories:
  - 编程实战
tags:
  - Python
  - 数据分析
  - Pandas
description: 记录我用 Pandas 处理数据的入门心得，涵盖数据读取、清洗、分组统计这几个最常用的操作。
cover: /img/cover-3.svg
---

作为大数据专业的学生，Python 是绕不开的工具。今天把 Pandas 最常用的几个操作整理一下，方便日后回看。

下面这套代码用的是课件里的学生数据（张三、李四、王五这几位老熟人），跟着敲一遍，比看十遍文档都管用。

## 一、先学会"造"数据：Series 和 DataFrame

Pandas 有两大核心结构：**Series（一列）** 和 **DataFrame（一张表）**。

### Series：一列数据

用列表就能造一个：

```python
import pandas

li = ["a", "b", "c", "d"]
se = pandas.Series(li)
print(se, type(se))
```

用字典造，key 自动变成索引：

```python
sites = {"a": "Google", "b": "Runoob", 3: "Wiki"}
se = pandas.Series(sites)
print(se, type(se))
```

### DataFrame：一张表

DataFrame 有三种常见构造方式：

**① 用二维列表（没有列名）：**

```python
li = [["张三", 18, "南宁"], ["李四", 20, "北京"], ["王五", 22, "上海"]]
df = pandas.DataFrame(li)
print(df)
```

**② 用字典（key 是列名）：**

```python
di = {
    "name": ["张三", "李四", "王五"],
    "age": [18, 20, 22],
    "city": ["南宁", "北京", "上海"],
}
df = pandas.DataFrame(di)
print(df)
```

**③ 用字典列表（最像真实数据）：**

```python
li = [
    {"name": "张三", "age": 18, "city": "南宁"},
    {"name": "李四", "age": 20, "city": "北京"},
    {"name": "王五", "age": 22, "city": "上海"},
]
df = pandas.DataFrame(li)
print(df)
```

> 第三种最常用，因为真实场景里数据往往就是"一行一个字典"的 JSON 格式。

## 二、查询取值：loc[] 的几种姿势

`loc[]` 是 Pandas 的查数据神器，先建好数据：

```python
import pandas as pd

li = [
    {"name": "张三", "age": 18, "city": "南宁"},
    {"name": "李四", "age": 20, "city": "北京"},
    {"name": "王五", "age": 22, "city": "上海"},
]
df = pd.DataFrame(li)
```

**取一个值：**

```python
print(df.loc[0, "name"])   # 张三
```

**取一行（会降维成 Series）：**

```python
print(df.loc[1], type(df.loc[1]))   # 输出一行 + <class 'Series'>
```

**切片取列：**

```python
print(df.loc[0:1, "name"])      # 前两行的 name 列
print(df.loc[0:1, "name":"age"]) # 前两行的 name 到 age 两列
print(df.loc[:, "name"])         # 整列 name
```

**取指定的多列 / 多行：**

```python
print(df.loc[:, ["name", "city"]])  # 只要 name 和 city 两列
print(df.loc[[0, 2]])               # 只要第 0 行和第 2 行
```

> 记忆技巧：`loc[行, 列]`，行在前列在后，中间用逗号隔开。要哪几列就用列表 `["a", "b"]`，要连续就用切片 `"a":"b"`。

## 三、条件筛选：& | ~ 三个符号

筛选是最常用的操作，关键记三个符号：

- `&` 表示 and（并且）
- `|` 表示 or（或者）
- `~` 表示 not（取反）

先造个带分数的数据：

```python
import pandas as pd

li = [
    {"name": "张三", "age": 18, "city": "南宁", "score": 100},
    {"name": "李四", "age": 20, "city": "北京", "score": 70},
    {"name": "王五", "age": 22, "city": "上海", "score": 80},
]
df = pd.DataFrame(li)
```

**年龄大于 20 的人：**

```python
print(df.loc[(df.age > 20)])
```

**年龄 ≥ 20 且 分数 > 75（查名字和城市）：**

```python
print(df.loc[(df.age >= 20) & (df.score > 75), ["name", "city"]])
```

**年龄 ≥ 20 或 分数 > 75：**

```python
print(df.loc[(df.age >= 20) | (df.score > 75), ["name", "city"]])
```

**取反（年龄不大于 20 的）：**

```python
print(df.loc[~(df.age > 20)])
```

> 坑：每个条件都要用**括号包起来**，再用 `&` / `|` 连接，否则会报错。

**类型转换小技巧**——如果 age 列是字符串，比较前先 `astype` 转成数字：

```python
li = [
    {"name": "张三", "age": "18", "city": "南宁", "score": 100},
    {"name": "李四", "age": "20", "city": "北京", "score": 70},
    {"name": "王五", "age": "22", "city": "上海", "score": 80},
    {"name": "王五", "age": "23", "city": "上海", "score": 80},
]
df = pd.DataFrame(li)
print(df.loc[(df.age.astype(int) > 20)])
```

**快速看头尾：**

```python
print(df.head(3))  # 前 3 行
print(df.tail(3))  # 后 3 行
```

## 四、增删改：数据操作三件套

### 删除 drop

`axis` 是关键：`axis=0` 删行，`axis=1` 删列。`inplace=True` 表示直接改原表。

```python
df.drop(0, axis=0, inplace=True)       # 删除第 0 行
df.drop("age", axis=1, inplace=True)    # 删除 age 列
df.drop(["age", "score"], axis=1, inplace=True)  # 删多列
df.drop([0, 2], axis=0, inplace=True)   # 删多行
```

不加 `inplace=True` 就是生成新表，原表不动：

```python
df1 = df.drop("age", axis=1)   # df 不变，df1 是删掉 age 后的新表
```

**按条件删行**（删掉名字叫李四的行）：

```python
index1 = df.loc[(df.name == "李四")].index  # 先找到李四那行的索引
df.drop(index1, axis=0, inplace=True)        # 再按索引删掉
```

### 添加列

**加常量列：**

```python
df["classname"] = "75班"   # 整列都是同一个值
```

**加非常量列（一行一个值）：**

```python
df["sex"] = ["男", "女", "男", "男"]
```

**加带空值的列（用 `np.nan` 表示空）：**

```python
import numpy as np

df["sex"] = ["男", "女", np.nan, "男"]
```

### 修改数据

思路就是八个字：**先查出来，再重新赋值**。

```python
# 把最后一行的 city 从"上海"改成"南京"
df.loc[3, "city"] = "南京"
```

## 五、数据清洗：脏数据的四种处理

### 1. 删除空值 dropna()

```python
import pandas as pd
import numpy as np

li = [
    {"name": "张三", "age": "18", "city": "南宁", "score": 100},
    {"name": "李四", "age": "20", "city": "北京", "score": np.nan},
    {"name": "王五", "age": "22", "city": np.nan, "score": 80},
    {"name": "王五", "age": "23", "city": "上海", "score": 80},
]
df = pd.DataFrame(li)

df1 = df.dropna()                              # 删除所有含空值的行
df = df.dropna(subset=["city"], axis=0)        # 只删 city 列含空值的行
```

### 2. 填充空值 fillna()

```python
# 用均值填 score 列，用"未知"填 city 列
avg_score = df["score"].mean()
df = df.fillna(value={"city": "未知", "score": avg_score})
```

还有向下填充（拿上一行的值填）：

```python
df = df.set_index("sno")   # 先把 sno 设为索引
df.ffill(inplace=True)     # 向下填充（bfill 是向上填充）
```

### 3. 删除重复行 drop_duplicates()

```python
# 删除 name 重复的行，保留最后一次出现（keep="last"）
df = df.drop_duplicates("name", keep="last", ignore_index=True)
```

`keep="first"` 保留第一次，`ignore_index=True` 重新编号。

### 4. 替换值 replace()

```python
# 把 score 列里的 -10（异常值）替换成 0
df["score"] = df["score"].replace(-10, 0)
```

## 六、数据转换：apply 和 map

### apply()：对一列批量套函数

```python
def age_add(age):
    return age + 1

df["new_age"] = df["age"].apply(age_add)   # 每行年龄都 +1
```

### map()：批量映射（像查字典）

```python
# sex 列 1 → 男，0 → 女
df["sex"] = df["sex"].map({1: "男", 0: "女"})
```

> `apply` 是"套函数"，`map` 是"查字典"，两者都是对一列做批量转换，选哪个看场景。

## 七、分组统计 groupby()

`groupby` 是数据分析的利器，配合聚合函数出结果：

```python
li = [
    {"name": "张三", "age": 18, "city": "南宁", "score": 100, "dept": "IT", "sal": 3000},
    {"name": "李四", "age": 20, "city": "北京", "score": 88, "dept": "IT", "sal": 5000},
    {"name": "王五", "age": 22, "city": "上海", "score": 80, "dept": "财务", "sal": 4500},
    {"name": "lili", "age": 23, "city": "南京", "score": 80, "dept": "销售", "sal": 2000},
    {"name": "smark", "age": 24, "city": "南京", "score": 80, "dept": "财务", "sal": 4550},
    {"name": "davi", "age": 23, "city": "南京", "score": 80, "dept": "销售", "sal": 2000},
]
df = pd.DataFrame(li)
```

**每个部门的平均薪资：**

```python
result = df.groupby(["dept", "city"])["sal"].mean()
```

**每个部门的最高薪资：**

```python
result = df.groupby("dept")["sal"].max()
```

**一次算多个指标（agg 聚合）：**

```python
df_group = df.groupby("dept")["sal"].agg(["mean", "max", "min"])
```

## 八、表连接：merge 和 concat

### merge()：类似 SQL 的 join

```python
# 按 id 把两张表合并
df3 = pd.merge(df1, df2, on="id", how="inner")
```

`how` 参数对应四种连接：`inner`（内）/ `left`（左）/ `right`（右）/ `outer`（外）。

### concat()：类似 union all，上下拼接

```python
# 新增一行数据，拼到原表下面
di = {"sno": 1008, "name": "黄老九", "age": 57, "sex": "男", "score": 60}
df3 = pd.DataFrame(di, index=[0]).set_index("sno")
df4 = pd.concat([df, df3])
```

> `merge` 是"左右拼列"，`concat` 是"上下拼行"，别搞混。

## 九、几个常用小函数

```python
# 排序：先按 score 降序，score 相同再按 sal 升序
df_sort = df.sort_values(by=["score", "sal"], ascending=[False, True])

# 筛选：名字在给定列表里的行
df2 = df.loc[(df.name.isin(["李四", "赵六", "田七"]))]

# 随机抽几行看数据
df6 = df.sample(3)

# 重命名列
df.rename(
    columns={"name": "姓名", "age": "年龄", "sex": "性别", "score": "分数"},
    inplace=True,
)
```

## 小结

工具只是手段，理解数据背后的业务含义才是关键。接下来打算再深入学一下可视化，把 Matplotlib 和 Seaborn 用起来。
