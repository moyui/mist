# 目的

本项目是借助nest技术栈所开发的一款股票告警软件，用以通过一系列策略发出买入买出点，
目前需求如下

## 需求

该项目迭代肯定要花费大量时间，目前一期的目标是上证指数的分析，同时数据采集部分通过deepseek完成
所需的模块如下

1. 数据采集与存储模块，通过开源接口收集a股数据，清洗后并存储在本地的mysql数据库，时间精度目前期望实现5分钟级别
2. 数据分析模块，通过相关开源算法或者其他方向实现a股常用指标的判断和展示，目前一期打算实现k线，macd和kdj
3. 策略分析模块，通过相关策略配置实现买入卖出点的告警，目前一期打算实现顶背离和底背离，后期需要实现分钟级别共振和缠论中的顶背驰和底背驰
4. 告警模块，通过策略分析模块中得到的告警，发出提示，目前一期期望实现微信告警或者qq机器人告警
5. 回测模块，通过当前策略以及历史数据分析策略的有效性，目前一期暂时不做考虑开发

## 详细设计

### 数据采集与存储

感谢 [AKTools](https://aktools.akfamily.xyz/#fastapi) 目前尝试使用aktools来本地启动金融api，后续会自己替换
采集：axios请求本地http接口
收集：mysql存储格式化数据

附：python使用说明

- 安装虚拟环境
  python3 -m venv python-env
- 激活虚拟环境
  source python-env/bin/activate
- 退出虚拟环境
  deactivate
- 安装AKTools
  python3 -m pip install aktools
- 启动
  python3 -m aktools

数据库建立语句 CREATE DATABASE mist DEFAULT CHARACTER SET utf8mb4;

设计表结构

指数表 - IndexData

| 字段名      | 数据类型      | 描述                                |
| ----------- | ------------- | ----------------------------------- |
| id          | INT           | 指数id                              |
| name        | VARCHAR(50)   | 指数名                              |
| symbol      | VARCHAR(50)   | 指数编号                            |
| type        | ENUM          | 指数类型 1-大盘股 2-中盘股 3-小盘股 |
| period      | IndexPeriod[] | 外键                                |
| create_time | DATETIME      | 创建时间                            |
| update_time | DATETIME      | 更新时间                            |

指数分时表（5、15、30、60分钟都类似） - IndexPeriod

| 字段名        | 数据类型       | 描述                           |
| ------------- | -------------- | ------------------------------ |
| id            | INT            | id (主键)                      |
| time          | VARCHAR(50)    | 时间                           |
| open          | DCECIMAL(12,2) | 开盘                           |
| close         | DCECIMAL(12,2) | 收盘                           |
| highest       | DCECIMAL(12,2) | 最高                           |
| lowest        | DCECIMAL(12,2) | 最低                           |
| volume        | BIGINT         | 成交量 注意单位: 手            |
| price         | DOUBLE         | 成交额 注意单位: 元            |
| vibration     | DCECIMAL(12,2) | 振幅                           |
| turnover_rate | DOUBLE         | 换手率                         |
| type          | ENUM           | 类型 FIVE FIFTEEN THIRTY SIXTY |
| index_id      | INT            | 指数id 外键                    |
| create_time   | DATETIME       | 创建时间                       |
| update_time   | DATETIME       | 更新时间                       |

定时任务 使用 @nestjs/schedule 效果有待考察

### 数据分析

待续

### 踩坑

aktools不会自动提示端口被占用，从而导致请求失败
