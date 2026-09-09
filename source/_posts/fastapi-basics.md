---
title: FastAPI 接口入门：让 Python 学会"开门营业"
date: 2026-08-30 11:00:00
categories:
  - 编程实战
tags:
  - Python
  - FastAPI
  - 后端
  - 接口
description: 用大白话讲清楚 FastAPI 怎么搭接口：路由、四大请求方法、参数怎么传、文件怎么收，还有那个自动生成的 /docs 文档到底有多香。
cover: /img/cover-1.svg
---

以前觉得"写后端接口"是件特别神秘的事，直到上手 FastAPI，才发现原来就是给 Python 函数贴个标签，然后它自己就变成能对外服务的接口了。这篇把我从课件里学到的东西整理一遍，纯大白话，保证看完能"依葫芦画瓢"跑起来。

## 一、FastAPI 是啥？一句话：给 Python 装上"前台"

你写的 Python 函数平时只能自己跑自己用，FastAPI 做的事就是**把它变成别人也能通过网址调用的服务**。

打个比方：你在美团点外卖，结账时选了微信支付。美团 APP 不知道你微信里有多少钱，微信也不可能把密码告诉美团——它们俩中间靠的就是**接口（API）**在传话：

```
美团 APP  →  调用微信的接口  →  微信扣款  →  把结果传回来
```

FastAPI 就是帮你"开店"的工具，你负责定义每个接口（卖什么、怎么收费），它负责接待客人（收请求、给响应）。而且它最香的一点：**代码写完，接口文档自动生成**，不用你手写，打开浏览器就能看到、能测。

先把环境装好：

```bash
pip install fastapi uvicorn          # fastapi 是框架，uvicorn 是跑起来的服务器
pip install fastapi_cdn_host         # 加速文档加载，可选
pip install python-multipart         # 后面传 form 表单要用
```

## 二、第一段代码：五步开个"空店铺"

```python
from fastapi import FastAPI
import fastapi_cdn_host
import uvicorn

app = FastAPI()                      # 1. 搭一个空网站架子
fastapi_cdn_host.patch_docs(app)     # 2. 优化文档加载（可不写）

@app.get("/")                        # 3. 首页接口：访问根路径就执行下面函数
def index():
    return "这是网站的首页"

@app.get("/hello")                   # 4. 再来一个 /hello 接口
def hello():
    return {"data": "hello fastapi"} # 返回字典，FastAPI 自动转成 JSON

if __name__ == "__main__":
    uvicorn.run("文件名:app", port=8000, reload=True)  # 5. 跑起来
```

看到没，核心就是 `@app.get("路径")` 这个**装饰器**——它就像给函数贴了个"收货地址"标签，FastAPI 看到有人访问这个地址，就把请求送到对应的函数手里。

跑起来后浏览器打开：
- `http://localhost:8000/` → 显示"这是网站的首页"
- `http://localhost:8000/hello` → 显示 `{"data": "hello fastapi"}`

## 三、接口就四个要素，记住这四点就入门了

一个接口说穿了就是四个东西：

| 要素 | 通俗解释 | 例子 |
|---|---|---|
| 接口地址 | 接口的"门牌号" | `http://localhost:8000/hello` |
| 请求方法 | 访问的"方式" | GET（查数据）、POST（加数据） |
| 请求参数 | 传过去的"信息" | 比如查用户时传个用户 ID |
| 返回数据 | 接口给你的"结果" | `{"data": "hello fastapi"}` |

四大请求方法，用生活例子一下就记住：

| 装饰器 | 方法 | 干什么 | 生活例子 |
|---|---|---|---|
| `@app.get` | GET | 查数据（只读） | 查快递到哪了 |
| `@app.post` | POST | 新增数据 | 注册账号 |
| `@app.put` | PUT | 更新数据 | 改个人资料 |
| `@app.delete` | DELETE | 删数据 | 取消订单 |

```python
@app.get("/get")
def get():
    return {"请求方法": "GET方法"}

@app.post("/post")
def post():
    return {"请求方法": "POST方法"}
# put、delete 同理，把 @app.post 换成 @app.put / @app.delete 就行
```

## 四、最省心的地方：自动生成的 /docs 文档

别的框架，接口文档得自己手写，写完还可能和代码对不上。FastAPI 不一样——**代码就是文档**。

服务跑起来后，直接打开 `http://localhost:8000/docs`，所有你定义的接口都整整齐齐列在那儿，每个接口都能点 "Try it out" 直接在线测试，输入参数、点 Execute，结果和状态码（200 表示成功）立刻显示。对小白极度友好。

想自己测也可以用 Postman：新建请求 → 方法选 GET → 地址填 `http://localhost:8000/hello` → 点 Send，右侧 Response 区就会冒出 `{"data": "hello fastapi"}`。

## 五、给接口"贴标签"：装饰器的扩展参数

接口多了以后，文档里会乱。这时可以给装饰器加几个参数，让文档更清晰、更好管理：

```python
@app.get(
    "/get",
    tags=["用户管理"],                  # 分类标签，文档里会分组显示
    summary="查询用户信息",              # 一句话简介
    description="根据用户ID查询基础信息", # 详细说明
    response_description="返回用户信息字典", # 返回结果的说明
    deprecated=True,                   # 标记"已废弃"，文档里会标红
)
def get():
    return {"请求方法": "GET方法"}
```

记住一句话：**基础装饰器让接口"能用"，这些扩展参数让接口"好懂、好管理"**。

## 六、接口写多了怎么办？APIRouter 分货架

接口全塞一个文件里，写多了就像"超市所有商品堆一个货架"，找都找不到。APIRouter 就是**按品类分货架**：

```
项目/
├── main.py          # 主入口，负责汇总
├── app01/url.py     # 食品类接口
└── app02/url.py     # 家居类接口
```

分模块里写法几乎一样，只是把 `FastAPI` 换成 `APIRouter`：

```python
# app01/url.py
from fastapi import APIRouter
app01 = APIRouter()

@app01.get("/food")
def food():
    return {"food_name": "馒头"}
```

主文件里用 `include_router` 把分货架"挂"进来：

```python
from fastapi import FastAPI
from app01.url import app01
from app02.url import app02

app = FastAPI()
app.include_router(app01, tags=["this is app01"])
app.include_router(app02, tags=["this is app02"])
```

这样接口再多，也能按模块分得清清楚楚。

## 七、参数到底怎么传？搞懂这几种就够了

前端和后端传数据，常见就这几种方式：

**1. 路径参数——直接写在网址里**

`http://localhost:8000/getuser/1001` 里的 `1001` 就是参数：

```python
@app01.get("/getuser/{userid}")
def getuser(userid: int):          # 声明成 int，FastAPI 自动校验
    return {"userid": userid, "username": "lili"}
```

如果访问 `/getuser/abc`（传了字符串），FastAPI 会自动返回 422 校验错误，省得你自己写判断。

**2. 查询参数——网址后面加 `?key=value`**

`http://localhost:8000/getjob?kw=python&xl=本科` 这种，适合筛选、搜索：

```python
@app02.get("/getjob")
def getjob(kw: str, xl: Optional[str] = None):  # kw 必传，xl 可选
    return {"关键词": kw, "学历": xl}
```

没有默认值的参数就是"必传"，不传直接报错；给了默认值 `= None` 的就是"可选"。

**3. 请求体——POST 传复杂数据（Pydantic 模型）**

路径参数和查询参数都拼在 URL 上，明晃晃的，不适合传复杂或私密的东西。请求体就像"寄快递"——URL 是快递站地址，请求体是包裹里那张填满信息的快递单。

FastAPI 用 Pydantic 模型当"数据模板"，你规定了字段，它自动帮你校验：

```python
from pydantic import BaseModel, Field

class User(BaseModel):
    id: int                          # 必填整数
    name: str                        # 必填字符串
    age: int = Field(default=18, gt=2, lt=100)  # 默认18，且 >2 且 <100

@app03.post("/user")
def user(user: User):               # 参数声明成 User 类型
    return user                      # FastAPI 自动解析、校验、封装
```

传错类型、漏传必填，都会给你返回清晰的 422 报错，堪称"免费的前端校验员"。

**4. Form 表单——网页登录那种键值对**

```python
from fastapi import Form

@app04.post("/regis")
def regis(userid: str = Form(), passwd: str = Form()):
    return {"userid": userid}
```

区别很简单：JSON 请求体像"详细简历"（能嵌套），Form 表单像"快递单"（扁平键值对）。

**5. 文件上传——优先用 UploadFile**

```python
from fastapi import UploadFile, File

@app05.post("/uploadfile")
def upload_file(file: UploadFile = File()):
    file_path = f"img/{file.filename}"
    with open(file_path, "wb") as f:
        for line in file.file:      # 流式写入，省内存
            f.write(line)
    return {"filename": file.filename}
```

小文件可以用 `bytes = File()` 直接读进内存，大文件（视频那种）就一定要用 `UploadFile`，它流式读取，不会把内存撑爆。

## 八、响应模型：让接口"该说的说，不该说的憋回去"

有个特别实用的功能叫**响应模型**，专门解决"手滑把密码也返回出去"的安全问题：

```python
class User_in(BaseModel):   # 接收模板：密码这些都得有
    id: int
    username: str
    passwd: str
    email: str
    fullname: str

class User_out(BaseModel):  # 返回模板：只留该给的
    username: str
    email: str
    fullname: str

@app06.post("/user_create", response_model=User_out)
def user_create(user: User_in):
    return user              # 自动把 id、passwd 过滤掉
```

`response_model=User_out` 这一句，就相当于告诉 FastAPI："返回的东西只能长 User_out 这样"。密码、ID 这些敏感字段自动被挡在门外，安全感拉满。

## 小结

FastAPI 的学习曲线是真的平，核心就一条线：

1. `@app.请求方法("路径")` 贴标签，函数就变成接口；
2. 参数四种传法：路径参数、查询参数、请求体、Form/文件；
3. 接口多了用 `APIRouter` 分模块，`include_router` 汇总；
4. 返回前套个 `response_model`，敏感字段自动过滤；
5. 全程有 `/docs` 文档兜底，写完就能测。

工具只是手段，能跑通、能看懂、能照着改，就是最好的开始。剩下的，就交给 `uvicorn` 跑起来，然后打开 `localhost:8000/docs` 享受那份"我居然也能写后端"的成就感吧。
