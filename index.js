// 酒馆输入框修复助手 v1.1
// 只操作输入框样式，不碰聊天数据、角色卡、世界书、存档或 API 配置
(function () {
    'use strict';
    var FIX_HEIGHT = '44px';

    function applyFix() {
        var ta = document.getElementById('send_textarea');
        if (!ta) {
            return;
        }
        ta.style.height = FIX_HEIGHT;
        ta.style.maxHeight = FIX_HEIGHT;
        ta.style.minHeight = FIX_HEIGHT;
        ta.style.resize = 'none';
        ta.style.overflowY = 'auto';
    }

    // 立即执行一次
    applyFix();
    // 定时兜底：酒馆会重渲染/切换主题，新生成的输入框也要被钉住
    setInterval(applyFix, 800);

    // 软键盘弹出/收起导致视口变化时，再补一次
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', applyFix);
    }
})();
