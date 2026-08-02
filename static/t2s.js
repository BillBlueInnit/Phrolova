// ============================================================
// 简繁支持：让玩家可以用「繁体中文」输入角色名 / 声骸名，
// 也能被识别（自动补全 / 提交猜测都会先转成简体再匹配）。
// 显示始终是简体（因为数据库存储并展示的都是简体名）。
//
// 实现：
//  1. 优先懒加载 opencc-js（CDN），转换最准确；
//  2. 若 CDN 不可用，回退到内置的常用简繁对照表。
// ============================================================
(function () {
  // ---------- 内置简繁对照表（繁体 -> 简体）----------
  // 覆盖游戏内「鸣潮」角色 / 声骸 / 字段中可能出现的高频繁体字。
  const T2S_MAP = {
    '門':'门', '聞':'闻', '開':'开', '關':'关', '間':'间', '問':'问', '們':'们',
    '長':'长', '張':'张', '陽':'阳', '陰':'阴', '隱':'隐', '陸':'陆', '險':'险',
    '雲':'云', '電':'电', '雷':'雷', '霜':'霜', '霧':'雾', '雪':'雪',
    '風':'风', '颱':'台', '飄':'飘', '飛':'飞', '颯':'飒', '颶':'飓',
    '馬':'马', '駕':'驾', '騎':'骑', '鳴':'鸣', '鳥':'鸟', '鴉':'鸦', '鶴':'鹤',
    '魚':'鱼', '鯨':'鲸', '貝':'贝', '龍':'龙', '龜':'龟', '鮫':'鲛', '鰩':'鳐',
    '車':'车', '輪':'轮', '轉':'转', '輕':'轻', '較':'较', '軸':'轴', '軌':'轨',
    '動':'动', '勁':'劲', '勢':'势', '熱':'热', '點':'点',
    '義':'义', '儀':'仪', '議':'议', '犧':'牺', '澤':'泽',
    '聲':'声', '聽':'听', '聖':'圣', '擊':'击', '響':'响', '戰':'战', '單':'单',
    '無':'无', '為':'为', '偽':'伪', '歸':'归', '當':'当', '嘗':'尝', '賞':'赏',
    '堅':'坚', '軍':'军', '陣':'阵', '際':'际', '隨':'随', '離':'离', '難':'难',
    '顯':'显', '頭':'头', '顏':'颜', '頓':'顿', '額':'额', '願':'愿', '類':'类',
    '頌':'颂', '預':'预', '驗':'验', '題':'题', '顧':'顾', '頁':'页', '頰':'颊',
    '寶':'宝', '實':'实', '審':'审', '寫':'写', '寢':'寝', '寧':'宁', '寬':'宽',
    '對':'对', '專':'专', '將':'将', '導':'导', '尋':'寻', '屬':'属', '屢':'屡',
    '帥':'帅', '師':'师', '帶':'带', '幫':'帮', '幣':'币', '帳':'账', '慶':'庆',
    '應':'应', '壞':'坏', '場':'场', '塊':'块', '報':'报', '執':'执', '爾':'尔',
    '穩':'稳', '請':'请', '諸':'诸', '說':'说', '誰':'谁', '課':'课', '調':'调',
    '謙':'谦', '謝':'谢', '識':'识', '證':'证', '變':'变', '讓':'让', '講':'讲',
    '計':'计', '討':'讨', '語':'语', '誠':'诚', '認':'认', '誤':'误', '該':'该',
    '論':'论', '設':'设', '謎':'谜', '護':'护', '財':'财', '賢':'贤', '賭':'赌',
    '買':'买', '賣':'卖', '貴':'贵', '質':'质', '費':'费', '資':'资', '賜':'赐',
    '贈':'赠', '贊':'赞', '貨':'货', '賠':'赔', '載':'载', '輔':'辅', '輝':'辉',
    '陳':'陈', '隸':'隶', '雙':'双', '靈':'灵', '靜':'静', '靂':'雳', '順':'顺',
    '須':'须', '頂':'顶', '頑':'顽', '顆':'颗', '餐':'餐', '飽':'饱', '養':'养',
    '館':'馆', '騙':'骗', '驅':'驱', '駭':'骇', '騰':'腾', '驚':'惊', '體':'体',
    '髮':'发', '鬆':'松', '鬱':'郁', '鬥':'斗', '範':'范', '裏':'里', '迴':'回',
    '乾':'干', '醜':'丑', '鍾':'钟', '臺':'台', '係':'系', '夾':'夹', '異':'异',
    '夠':'够', '產':'产', '吳':'吴', '硯':'砚', '幹':'干', '後':'后',
  };

  function builtinToSimplified(text) {
    if (!text) return text;
    let out = '';
    for (const ch of String(text)) {
      out += T2S_MAP[ch] || ch;
    }
    return out;
  }

  // lazily load opencc-js 的完整构建（暴露全局 OpenCC）
  let openccConverterPromise = null;
  function getConverter() {
    if (!openccConverterPromise) {
      openccConverterPromise = new Promise(function (resolve) {
        try {
          if (typeof globalThis !== 'undefined' && globalThis.OpenCC) {
            resolve(globalThis.OpenCC);
            return;
          }
          var s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js';
          s.async = true;
          s.onload = function () { resolve((globalThis && globalThis.OpenCC) || null); };
          s.onerror = function () { resolve(null); };
          document.head.appendChild(s);
        } catch (e) {
          resolve(null);
        }
      });
    }
    return openccConverterPromise;
  }

  async function toSimplified(text) {
    if (!text) return text;
    try {
      const OpenCC = await getConverter();
      if (OpenCC) {
        // 台湾/香港繁体 -> 大陆简体
        const converter = OpenCC.Converter({ from: 'tw', to: 'cn' });
        return converter(text);
      }
    } catch (e) { /* ignore */ }
    // 兜底：内置对照表
    return builtinToSimplified(text);
  }

  // 同步兜底版本（用于首次加载 CDN 尚未就绪、自动补全等场景）
  function toSimplifiedSync(text) {
    if (!text) return text;
    try {
      if (typeof globalThis !== 'undefined' && globalThis.__t2sConverter) {
        return globalThis.__t2sConverter(text);
      }
    } catch (e) { /* ignore */ }
    return builtinToSimplified(text);
  }

  // 暴露接口
  window.toSimplified = toSimplified;
  window.toSimplifiedSync = toSimplifiedSync;
  window.__t2sBuiltin = builtinToSimplified;

  // 预热转换器，稍后把同步版指向 opencc，保证提交时用最准确的转换
  getConverter().then(function (OpenCC) {
    try {
      if (OpenCC) {
        window.__t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' });
      }
    } catch (e) { /* ignore */ }
  });
})();
