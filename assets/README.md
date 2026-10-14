# 美术素材包 · 夕明 · 余烬之城

本项目所有美术都是**代码内嵌的像素表**（`../src/art.js`）与**程序化绘制的瓦片**（`../src/world.js`）。
这份目录把它们**全部导出成通用图片资源**，可以直接拿去 Godot / Unity / Aseprite / 网页 / 打印稿等任何地方用。

## 目录结构

```
assets/
├── sprites/  sprites@2x/  sprites@4x/  sprites@8x/   角色 / 敌人 / Boss / 道具 / 技能图标（按原尺寸与 2/4/8 倍整数放大）
├── tiles/<区域>/  tiles/<区域>@2x/  tiles/<区域>@4x/  四套地形瓦片（16×16 原始尺寸）
│       区域：indoor 大建筑室内 / street 室外街道 / highway 城市外公路 / council 议事厅
├── props/  props@2x/  props@4x/                      交互道具（合成台、通缉板、电梯、楼梯、井盖、天桥、传送门、摄像头…）
├── vehicles/  vehicles@2x/                           载具（汽车、卡车、火车 3 节 / 8 节）
├── weapons/  weapons@2x/                             21 种武器图标（含合成武器）
├── atlas/                                            图集：sprites_atlas.png（1x/2x）+ tiles_<区域>.png + 同名 .json 坐标表
├── preview/sprites_contact_sheet.png                 全部精灵的总览图（3 倍放大，带文件名）
├── data/palettes_sprites.json                        每个精灵的调色板（十六进制）
├── data/palettes_biomes.json                         四套地形的主色（地面/墙/描边）
├── data/sprites_source.json                          精灵的原始像素表（行字符串 + 调色板，可重新生成）
├── manifest.json                                     完整文件清单（含中文名、分类、尺寸）
└── ximing-art-assets.zip                             以上全部内容的压缩包（435KB）
```

**统计**：843 个文件 —— 精灵 37、地形瓦片 604（4 区域 × 151 种，含 1x/2x/4x）、道具 34、载具 8、武器 42，另有图集与清单。

## 关键规格

- **瓦片尺寸**：16×16 px（`manifest.json` 里的 `tileSize` 也是 16）
- **角色尺寸**：16×16 px；Boss 为 32×32 px；齐青与夕明都是 16×16，四向 × 2 帧（`player_down_0/1`、`player_side_0/1` 等，侧面素材朝向**右**，向左请水平翻转）
- **道路 / 铁轨**：`tiles/<区域>/road.png`、`rails.png`，同为 16×16
- **放大的版本**：`@2x/@4x/@8x` 目录是**手动最近邻放大**的结果，边缘绝对干净，不会出现模糊；用于大尺寸展示或高分辨率 UI
- **图集坐标**：`atlas/sprites_atlas.json` 与 `atlas/tiles_<区域>.json` 给出每张图在合集里的 `x/y/w/h`

## 导入建议

**Godot 4**
1. 把 `sprites/`（或 `tiles/<区域>/`）整个拖进项目
2. 选中导入的图片 → 导入面板里设置：`Filter` 关掉（关闭滤镜）、`Mipmaps` 关掉、`Compress Mode` 选 Lossless
3. 用到角色时，精灵帧的 `Snap 2D Transforms to Pixel` 打开（项目设置 → 渲染 → 2D）
4. 瓦片直接拖进 `TileSet`，尺寸已经是 16×16

**Unity 6 / URP 2D**
1. 导入后选中所有贴图 → `Filter Mode: Point (no filter)`、`Compression: None`、`Pixels Per Unit: 16`
2. Sprite Mode 用 `Multiple` 时按图集 JSON 里的坐标切图，或直接用 `sprites/` 下的单张图
3. 想要我们那种篝火/霓虹的光感，可以给发光瓦片（`campfire`、`wall_neon`、`street_lamp`）加 2D Light 或 Bloom

**Aseprite / Photoshop**
直接打开 `preview/sprites_contact_sheet.png` 看总览，需要编辑单张就开 `sprites/` 下的文件（透明背景，PNG-8 风格调色板）。

## 重新生成

改了游戏里的美术（`src/art.js` 的像素表、或 `src/world.js` 的瓦片绘制）之后，跑一次：

```bash
npm install          # 首次：装 @napi-rs/canvas（离线渲染用的轻量 canvas）
npm run export-assets   # 等价于 node tools/export.mjs
```

脚本会**覆盖**本目录下的产物并重新打包 zip，不会碰源码。

## 授权

这些素材来自本项目自身（作者：Chen Cheng / @cchengoran525），随本仓库一同发布；同时项目里的像素表（`data/sprites_source.json`）也是同一份内容的文本形式，方便你在别的工具里重新生成或二次编辑。
