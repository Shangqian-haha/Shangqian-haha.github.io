---
title: Python 数据分析入门：从 Pandas 开始
date: 2026-09-02 21:00:00
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

## 读取数据

Pandas 能直接读入 CSV、Excel、SQL 等常见格式：

```python
import pandas as pd

df = pd.read_csv("data.csv")
df.head()   # 查看前 5 行
```

## 数据清洗

真实数据永远脏，清洗是第一步：

```python
# 处理缺失值
df = df.dropna(subset=["name"])

# 重命名列
df = df.rename(columns={"age": "年龄"})
```

## 分组统计

`groupby` 是数据分析的利器：

```python
result = df.groupby("city")["salary"].mean()
```

## 几个实用技巧

- 用 `df.info()` 快速了解数据规模与类型
- 用 `df.describe()` 看数值列的统计特征
- 用 `df.sort_values()` 排序后再观察

## 小结

工具只是手段，理解数据背后的业务含义才是关键。接下来打算再深入学一下可视化，把 Matplotlib 和 Seaborn 用起来。
