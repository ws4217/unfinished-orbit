# 素材来源与使用记录

## 新选主包：Top Down Sci-fi Tileset — SteelSoldier

- 来源：https://steelsoldier.itch.io/top-down-sci-fi-tileset
- 开发者已自行下载并选择为主包，原件在`assets/source/tilesets/steel-soldier/top-down-sci-fi/`，三个PNG均512×512；详细记录见该目录README.md。
- 已核对作者网页：允许非商业/商业项目使用，要求署名与作者页链接；当前下载目录无独立LICENSE文本，不声称包内已核验。
- 本轮只读取/核对，尚未裁切、接入或完成单房间样板。
- DithArt的`[alt]tileset_for_free.png`只作为开发者指定备用，具体使用未批准；不默认与主包混用。

## 已用于当前实现，待开发者确认具体搭配：Pixel Sci-Fi Tileset (16×16)

- 作者：reodesuxz。
- 来源：https://reodesuxz.itch.io/free-pixel-sci-fi-tileset-16x16
- 本地原件：assets/source/tilesets/reodesuxz/pixel-sci-fi/。
- 已阅读包内LICENSE.txt：允许个人/商业项目使用、修改，无强制署名；不允许作为独立素材包再售卖/再分发或用于训练模型。
- 游戏使用图集及必要许可，不打包完整原始素材库供独立使用。
- 建议署名：Pixel Sci-Fi Tileset by reodesuxz。

## 开发者已确认可使用：SCI-FI INTERIOR 32×32 FREE

- 作者署名：catter.pxl。
- 本地原件：`assets/source/tilesets/catter-pxl/sci-fi-interior/`，作者包内结构保留。
- 本地READ_ME.txt同时包含非商业限制与禁止再分发条款。
- 开发者在本轮已明确确认可以使用，可结合其他包；不再作内部排除。
- 最初阶段未接入该包；后续具体图片、场景与像素比例搭配先经开发者确认，不将授权等同视觉通过。
- 更新：此前逐项批准白/青墙、壁柜、通风口、植物和成组设备的尝试。实际接入`free_tiles.png`、`free_accesories.png`，对应`public/assets/tilesets/catter-pxl/interior-tiles.png`、`interior-props.png`；裁切与摆放现分见`src/content/assets/interior-frames.json`、`src/content/maps/legacy-interior.json`。没有接入桥梁或其他新包，旧地图视觉已否决。
- 32×32图按原尺寸，16×16图按最近邻2倍，统一32逻辑像素格。许可说明保留于`public/licenses/sci-fi-interior-readme.txt`；开发者视觉验收尚未完成。

## 开发者提供：像素字体

- 目录：assets/source/fonts，9×9及7×7分目录保留原名。
- 用户说明含9×9、9×9粗、7×7版本，优先9×9。
- 最初仅记录开发者提供文件；本轮的实际接入与授权核验如下。
- 更新：已核验两份9×9字体的name版权表，保留完整原始字体与授权说明；使用`fonttools`/`brotli`完整转换为WOFF2，未裁字。
- 常规体输出`public/assets/fonts/orbit-9x9.woff2`（398,640字节），粗体`orbit-9x9-bold.woff2`（376,928字节），各含13,157个Unicode码位。
- 字体内部说明允许商业/非商业使用、修改及再分发；原说明保留于`public/licenses/boutique-bitmap-notices.txt`。作者信息包含字言字型/fancy type foundry、来源组件与对应版权提示，不改成项目自有字体。
- 已批准粗体用于标题/窗口标题/姓名，其他文本常规；暂不接入7×7。

## 开发者提供：BGM

- 目录：assets/source/bgm/cryblik（五首）；Scarfaith另分目录，不套用此MIT声明。
- 作者：Cryblik（spacey_432）；开发者声明MIT协议且已得到授权。
- 曲目风格与用途建议见spec.md N节。
- Cryblik许可材料仍待归档；7首BGM的阶段/原曲采用已批准。M1已转换/生成Fleeting升调成品，并获开发者“试听无问题”反馈，未接入游戏；不等于游戏音画验收。

### Scarfaith新增两曲

- 开发者明确说明`intro.mp3`与`endofjourney.mp3`来自Scarfaith专辑《FLY INTO THE SKY》，已获使用授权。
- 独立登记为Scarfaith曲目，不套用Cryblik/Spacey的MIT声明；授权材料待发布前归档。
- 原件：`assets/source/bgm/scarfaith/fly-into-the-sky/`。第4轮已批准阶段用途；M1已生成Ogg成品并获试听确认，未接入游戏，原件哈希不变。

## 已核验许可、尚未接入：Kenney音效

- `assets/source/sfx/kenney/interface-sounds/License.txt`与`assets/source/sfx/kenney/sci-fi-sounds/License.txt`均已实际阅读，CC0。
- 作者允许个人、教育与商业项目使用，署名建议但不强制；本地分别100/73项OGG。
- 开发者已提交30项试听备注，并批准docs/audio-event-map.md的核心事件映射与备用边界；原始记录保留在assets/review/audio/user-sfx-preferences.json。清理短音已单独派生并试听通过，其他SFX未重复转换；均未接入，不能把所有反馈文件打包为运行资源。
- 原游戏提取音效若无权利人明确许可，不因“个人非商用”或粉丝上传而归为可用资源。

## 本项目生成

网格、简单几何标记及合成提示音由项目代码绘制/生成，无第三方音源。

## M3运行目录整理

- 获批7首BGM成品、16份核心SFX已就位`public/assets/bgm/`与`sfx/`，不包含14份备用声音。物理就位不等于游戏内已加载/播放。
- Kenney两份原始CC0文本无改写复制到`public/licenses/kenney-interface-sounds.txt`、`kenney-sci-fi-sounds.txt`。
- BGM开发者授权声明与仍待归档的Cryblik MIT原文/Scarfaith授权材料状态不变；本次迁移不冒充许可材料已核验或已完成对外发布。
- 所有运行文件源→目标及哈希见`docs/runtime-path-map.json`，游戏资源清单见`src/content/assets/`。
