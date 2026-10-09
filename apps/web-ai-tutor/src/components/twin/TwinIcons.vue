<template>
  <!-- PERSONA 图标精灵：全局挂载一次，供孪生各页 <use href="#i-x"> 引用 -->
  <view class="twin-sprite" aria-hidden="true">
    <svg width="0" height="0" style="position: absolute; overflow: hidden">
      <defs>
        <symbol id="i-person" viewBox="0 0 24 24"><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2M8 21v-4m8 4v-4" /></symbol>
        <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></symbol>
        <symbol id="i-world" viewBox="0 0 24 24"><path d="m3 8 9-5 9 5v8l-9 5-9-5Z" /><path d="m3 8 9 5 9-5M12 13v8M7 5.5l10 5.8" /></symbol>
        <symbol id="i-memory" viewBox="0 0 24 24"><path d="M6 3h11l3 3v15H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" /><path d="M6 3v18M10 8h6M10 12h6M10 16h4" /></symbol>
        <symbol id="i-replay" viewBox="0 0 24 24"><path d="M3 10a9 9 0 1 1 1 7M3 4v6h6" /><path d="m10 8 6 4-6 4Z" /></symbol>
        <symbol id="i-data" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" /></symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M4 12h16m-6-6 6 6-6 6" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12 5 5L20 7" /></symbol>
        <symbol id="i-exit" viewBox="0 0 24 24"><path d="M10 4H4v16h6m4-13 5 5-5 5m-5-5h10" /></symbol>
        <symbol id="i-spark" viewBox="0 0 24 24"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 3v4m-2-2h4" /></symbol>
        <symbol id="i-pin" viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></symbol>
        <symbol id="i-bolt" viewBox="0 0 24 24"><path d="m13 2-9 12h7l-1 8 10-13h-7Z" /></symbol>
        <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></symbol>
        <symbol id="i-star" viewBox="0 0 24 24"><path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" /></symbol>
        <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></symbol>
        <symbol id="i-upload" viewBox="0 0 24 24"><path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5" /></symbol>
        <symbol id="i-edit" viewBox="0 0 24 24"><path d="m15 3 6 6M3 21l6-2L21 7l-4-4L5 15Z" /></symbol>
        <symbol id="i-close" viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6" /></symbol>
        <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></symbol>
        <symbol id="i-chat" viewBox="0 0 24 24"><path d="M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-.8L3 21l1.6-5A9 9 0 1 1 21 11Z" /><path d="M8 11h.1M12 11h.1M16 11h.1" /></symbol>
        <symbol id="i-play" viewBox="0 0 24 24"><path d="m7 4 13 8-13 8Z" /></symbol>
        <symbol id="i-pause" viewBox="0 0 24 24"><path d="M8 4v16M16 4v16" /></symbol>
        <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" /></symbol>
        <symbol id="i-onto" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.4" /><circle cx="5" cy="19" r="2.4" /><circle cx="19" cy="19" r="2.4" /><path d="M12 7.5 6 16.7M12 7.5l6 9.2M7.5 19h9" /></symbol>
        <symbol id="i-node" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><circle cx="5" cy="5" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M6.6 6.6 9.8 9.8m4.4 0 3.2-3.2M6.6 17.4l3.2-3.2m4.4 0 3.2 3.2" /></symbol>
        <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3 4.6 6v6c0 4.5 5.4 8.4 7.4 8.9 2-.5 7.4-4.4 7.4-8.9V6Z" /><path d="m8.6 12 2.6 2.6 4.2-4.6" /></symbol>
        <symbol id="i-book" viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2Z" /><path d="M4 17a2 2 0 0 1 2-2h13" /></symbol>
        <symbol id="i-camera" viewBox="0 0 24 24"><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><circle cx="12" cy="12.5" r="3.5" /></symbol>
        <symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" /></symbol>
      </defs>
    </svg>
  </view>
</template>

<script>
export default { name: 'TwinIcons' }
</script>
