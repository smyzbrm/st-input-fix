// 酒馆输入框修复助手 v2.0
// 修复点：
//  1) 输入框固定 44px，禁止自动增高/拉伸（聚焦态同锁）
//  2) 软键盘弹起时，把输入栏钉在键盘上沿，不再"落下去"
//  3) 只在需要时才写样式，避免周期性重排造成跳动
// 不碰聊天数据、角色卡、世界书、存档或 API 配置
(function () {
    'use strict';
    var FIX_HEIGHT = '44px';

    function applyFix() {
        var ta = document.getElementById('send_textarea');
        if (!ta) return;
        if (ta.style.height !== FIX_HEIGHT || ta.style.minHeight !== FIX_HEIGHT || ta.style.maxHeight !== FIX_HEIGHT) {
            ta.style.height = FIX_HEIGHT;
            ta.style.maxHeight = FIX_HEIGHT;
            ta.style.minHeight = FIX_HEIGHT;
            ta.style.resize = 'none';
            ta.style.overflowY = 'auto';
        }
    }

    function pinSendForm() {
        var form = document.getElementById('send_form');
        if (!form) return;
        var vv = window.visualViewport;
        if (!vv) return;
        // 键盘占用高度 = 视口差
        var kb = window.innerHeight - vv.height - vv.offsetTop;
        if (kb > 20) {
            // 键盘弹起：把输入栏钉在键盘上沿
            form.style.bottom = kb + 'px';
        } else if (form.style.bottom) {
            // 键盘收起：还原为默认
            form.style.bottom = '';
        }
    }

    applyFix();

    // 仅在移动端启用键盘钉住
    if ('ontouchstart' in window && window.visualViewport) {
        window.visualViewport.addEventListener('resize', pinSendForm);
        window.visualViewport.addEventListener('scroll', pinSendForm);
    }

    // 定时兜底：酒馆重渲染后新输入框也要被钉住；
    // 已生效时函数内部会直接跳过，不产生重排
    setInterval(function () {
        applyFix();
        pinSendForm();
    }, 800);
})();
