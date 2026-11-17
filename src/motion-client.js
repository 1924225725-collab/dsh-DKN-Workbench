    // Scoped to workbench surfaces so host conversations and other plugins stay independent.
    const DKN_MOTION_CSS = `
      @keyframes dkn-page-enter{from{opacity:0}to{opacity:1}}
      @keyframes dkn-surface-enter{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
      @keyframes dkn-dialog-enter{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
      @keyframes dkn-spin{to{transform:rotate(360deg)}}
      .dkn-motion-page{animation:dkn-page-enter 180ms ease-out}
      :is(.dkn-motion-page,.dkn-hub-dialog,.dkn-modal-overlay) :is(button,a[href],input,select,textarea,summary){transition:background-color 160ms ease,border-color 160ms ease,box-shadow 160ms ease,opacity 160ms ease,transform 120ms ease}
      :is(.dkn-motion-page,.dkn-hub-dialog,.dkn-modal-overlay) :is(button,a[href]):not(:disabled):hover{border-color:var(--dsw-alias-label-secondary,#9299a6)}
      :is(.dkn-motion-page,.dkn-hub-dialog,.dkn-modal-overlay) :is(button,a[href]):not(:disabled):active{transform:translateY(1px) scale(.985)}
      .dkn-motion-page section,.dkn-motion-page .dkn-hub-card{transition:border-color 160ms ease,box-shadow 160ms ease}
      .dkn-motion-page section:hover,.dkn-motion-page .dkn-hub-card:hover{border-color:var(--dsw-alias-label-secondary,#9299a6)}
      :is(.dkn-motion-page,.dkn-hub-dialog,.dkn-modal-overlay) :focus-visible{outline:2px solid var(--dsw-alias-label-link,#6599e8);outline-offset:2px}
      .dkn-modal-overlay{animation:dkn-page-enter 160ms ease-out}
      .dkn-modal-overlay>[role=dialog],.dkn-hub-dialog[open]{animation:dkn-dialog-enter 180ms ease-out}
      .dkn-hub-dialog::backdrop{animation:dkn-page-enter 160ms ease-out}
      .dkn-motion-page [role=status],.dkn-motion-page [role=alert],.dkn-modal-overlay [role=status],.dkn-motion-content,.dkn-motion-page [data-region]:not([hidden]){animation:dkn-surface-enter 180ms ease-out}
      :is(.dkn-motion-page,.dkn-hub-dialog,.dkn-modal-overlay) button[aria-busy=true]::before{content:'';display:inline-block;width:.8em;height:.8em;margin-right:7px;border:1.5px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-.08em;animation:dkn-spin 800ms linear infinite}
      @supports (interpolate-size:allow-keywords){
        .dkn-motion-page details{interpolate-size:allow-keywords}
        .dkn-motion-page details::details-content{block-size:0;opacity:0;overflow:clip;transition:block-size 180ms ease,opacity 180ms ease,content-visibility 180ms allow-discrete}
        .dkn-motion-page details[open]::details-content{block-size:auto;opacity:1}
      }
      @media(prefers-reduced-motion:reduce){
        .dkn-motion-page,.dkn-motion-page *,.dkn-hub-dialog,.dkn-hub-dialog *,.dkn-hub-dialog::backdrop,.dkn-modal-overlay,.dkn-modal-overlay *{animation:none!important;transition:none!important;scroll-behavior:auto!important}
        :is(.dkn-motion-page,.dkn-hub-dialog,.dkn-modal-overlay) :is(button,a[href]):active{transform:none!important}
      }
    `;
    function DknMotionStyles(){return h('style',{'data-dkn-motion':''},DKN_MOTION_CSS);}
