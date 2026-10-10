// 酒馆输入框修复助手 v2.1
// 修复点：
//  1) 输入框固定 44px，禁止自动增高/拉伸（聚焦态同锁）
//  2) 软键盘弹起时，把输入栏钉在键盘上沿，不再"落下去"
//  3) 性能优化：只在值变化时才写样式 + rAF 合并高频事件，键盘弹收不再卡顿
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
        var kb = window.innerHeight - vv.height - vv.offsetTop;
        var target = kb > 20 ? kb + 'px' : '';
        // 只在值变化时写，避免无谓重排
        if (form.style.bottom !== target) {
            form.style.bottom = target;
        }
    }

    // rAF 合并高频的 resize/scroll 事件，一帧只写一次
    var rafPending = false;
    function schedulePin() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(function () {
            rafPending = false;
            pinSendForm();
        });
    }

    applyFix();

    if ('ontouchstart' in window && window.visualViewport) {
        window.visualViewport.addEventListener('resize', schedulePin);
        window.visualViewport.addEventListener('scroll', schedulePin);
    }

    // 低频兜底：酒馆重渲染后新元素也要被钉住；值没变时内部直接跳过
    setInterval(function () {
        applyFix();
        pinSendForm();
    }, 1000);
})();
