export const STYLES = `
.ow-root,.ow-root *{box-sizing:border-box}
.ow-root{
  --ow-ink:#111;--ow-muted:rgba(0,0,0,.55);--ow-faint:rgba(0,0,0,.35);
  --ow-line:rgba(0,0,0,.08);--ow-paper:#fff;--ow-canvas:#f4f4f5;
  --ow-ok:#16a34a;--ow-danger:#dc2626;--ow-warn:#d97706;
  --ow-font-ui:Inter,PingFang SC,Microsoft YaHei,system-ui,sans-serif;
  --ow-font-title:'STZhongsong','华文中宋','Noto Serif SC',serif;
  --ow-font-body:'Noto Serif SC','Source Han Serif SC','Songti SC','SimSun',serif;
  position:fixed;top:0;right:0;bottom:0;left:var(--ow-sidebar-left,56px);z-index:70;display:flex;flex-direction:column;
  background:var(--ow-canvas);color:var(--ow-ink);font-family:var(--ow-font-ui);
  pointer-events:auto;
}
.ow-btn{border:1px solid rgba(0,0,0,.14);background:#fff;border-radius:999px;padding:.42rem 1rem;cursor:pointer;font:inherit;font-size:.84rem;font-weight:500}
.ow-btn:hover{background:#fafafa}
.ow-btn.primary{background:#111;border-color:#111;color:#fff}
.ow-btn.primary:hover{background:#222}
.ow-btn.ghost{background:transparent;border-color:transparent;color:var(--ow-muted)}
.ow-btn.ghost:hover{background:rgba(0,0,0,.04);color:#111}
.ow-btn.sm{padding:.28rem .72rem;font-size:.78rem}
.ow-btn:disabled{opacity:.4;cursor:not-allowed}
.ow-icon-btn{border:none;background:transparent;width:32px;height:32px;border-radius:10px;cursor:pointer;color:var(--ow-muted)}
.ow-icon-btn:hover{background:rgba(0,0,0,.05);color:#111}
.ow-muted{color:var(--ow-muted)}
.ow-sm{font-size:.8rem}
.ow-chrome{flex:none;height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid var(--ow-line);background:rgba(255,255,255,.86);backdrop-filter:blur(16px);z-index:5}
.ow-chrome-title{font-size:.86rem;font-weight:650;letter-spacing:.04em}
.ow-lock-banner{flex:none;padding:.55rem .9rem;background:#fff7ed;color:#9a3412;font-size:.82rem;border-bottom:1px solid #fed7aa}
.ow-mode-watermark{position:absolute;right:1.25rem;bottom:1.1rem;pointer-events:none;z-index:0}
.ow-mode-watermark span{font-size:clamp(1.1rem,2.2vw,1.45rem);font-weight:700;letter-spacing:.2em;color:rgba(0,0,0,.08);user-select:none}
.ow-mode-watermark.encrypted span{color:rgba(153,27,27,.12)}
.ow-workspace{flex:1;min-height:0;display:flex;justify-content:center;overflow:hidden;position:relative;z-index:2}
.ow-stage{display:flex;align-items:stretch;justify-content:flex-start;gap:16px;width:min(1180px,100%);height:100%;padding:1.25rem 1.25rem 1.25rem;min-height:0;overflow:hidden;position:relative}
.ow-doc-scroll{flex:1 1 auto;min-width:0;max-width:760px;overflow:auto;align-self:stretch;scrollbar-width:thin;position:relative}
.ow-paper{background:var(--ow-paper);border-radius:22px;border:1px solid var(--ow-line);box-shadow:0 1px 2px rgba(0,0,0,.03),0 20px 50px rgba(0,0,0,.06);min-height:100%;position:relative}
.ow-paper-topbar{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.9rem 1.75rem;position:sticky;top:0;z-index:8;border-bottom:1px solid var(--ow-line);border-radius:22px 22px 0 0;background:rgba(255,255,255,.82);backdrop-filter:blur(18px)}
.ow-meta-left{display:flex;align-items:center;gap:.55rem;min-width:0}
.ow-paper-badge{font-size:.68rem;font-weight:600;letter-spacing:.04em;color:var(--ow-muted);background:rgba(0,0,0,.04);border:1px solid var(--ow-line);padding:.2rem .55rem;border-radius:999px;flex-shrink:0}
.ow-topic-line{color:var(--ow-muted);font-size:.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ow-char-count{display:flex;align-items:baseline;gap:.3rem;flex-shrink:0;font-variant-numeric:tabular-nums}
.ow-char-count .num{font-size:1.1rem;font-weight:650}
.ow-char-count .unit{font-size:.72rem;color:var(--ow-muted)}
.ow-paper-body{padding:52px 72px 40px}
.ow-root .ProseMirror{outline:none;min-height:0;font-family:var(--ow-font-body);font-size:16px;line-height:2;color:#111;letter-spacing:.04em}
.ow-root .ProseMirror p{margin:0 0 1.05em;text-indent:2em;text-align:justify}
.ow-root .ProseMirror h1{text-indent:0;text-align:center;font-family:var(--ow-font-title);font-size:28px;font-weight:400;line-height:1.55;letter-spacing:.12em;margin:.2em 0 1.6em}
.ow-root .ProseMirror h2,.ow-root .ProseMirror h3{text-indent:0;font-weight:600;margin:1.1em 0 .55em}
.ow-root .ProseMirror p.is-empty::before,.ow-root .ProseMirror h1.is-empty::before,.ow-root .ProseMirror h2.is-empty::before,.ow-root .ProseMirror h3.is-empty::before{content:attr(data-placeholder);float:left;height:0;color:var(--ow-faint);pointer-events:none;font-family:var(--ow-font-ui);font-size:.9rem}
.ow-root .ProseMirror h1.is-empty::before{float:none;display:block;text-align:center;width:100%}
.ow-root .ProseMirror p:has([data-ghost])::before{content:none !important}
.ow-ghost-text{color:rgba(0,0,0,.28);pointer-events:none;user-select:none}
.ow-ghost-loading{display:inline-flex;gap:3px;align-items:center;margin-left:1px;pointer-events:none;height:1em}
.ow-ghost-loading .dot{width:3px;height:3px;border-radius:50%;background:rgba(0,0,0,.35);animation:ow-pulse 1.2s ease-in-out infinite}
.ow-ghost-loading .dot:nth-child(2){animation-delay:.18s}
.ow-ghost-loading .dot:nth-child(3){animation-delay:.36s}
@keyframes ow-pulse{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:.85;transform:translateY(-1.5px)}}
.ow-audit-typo,.ow-audit-polish,.ow-audit-insert{cursor:pointer;position:relative}
.ow-audit-typo{text-decoration:underline wavy rgba(220,38,38,.45);text-underline-offset:3px}
.ow-audit-polish{text-decoration:underline dotted rgba(217,119,6,.45);text-underline-offset:3px}
.ow-audit-insert{box-shadow:inset 2px 0 0 rgba(22,163,74,.35)}
.ow-audit-typo::after,.ow-audit-polish::after,.ow-audit-insert::after{content:attr(data-issue-n);font-size:10px;line-height:1;margin-left:2px;vertical-align:super;color:var(--ow-faint);font-family:var(--ow-font-ui)}
.ow-audit-active{background:rgba(0,0,0,.04)}
.ow-audit-applied{background:rgba(22,163,74,.12);border-radius:2px;cursor:pointer}
.ow-comment-pane{width:240px;flex:0 0 240px;display:flex;flex-direction:column;min-height:0;align-self:stretch;position:relative;z-index:4}
.ow-comment-pane-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.35rem 0 .5rem}
.ow-comment-head-left{display:flex;align-items:center;gap:.4rem}
.ow-comment-pane-head h3{margin:0;font-size:.78rem;font-weight:600;letter-spacing:.04em}
.ow-comment-count{font-size:.7rem;color:var(--ow-muted);background:rgba(0,0,0,.04);padding:.12rem .45rem;border-radius:999px}
.ow-comment-busy{font-size:.72rem;color:var(--ow-muted)}
.ow-comment-scroll{flex:1;min-height:0;overflow:auto;padding:0 2px .7rem;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin}
.ow-comment-empty{padding:1.2rem .2rem;color:var(--ow-faint);font-size:.78rem;line-height:1.65}
.ow-anno-card{background:rgba(255,255,255,.9);border:1px solid var(--ow-line);border-radius:10px;padding:.55rem .65rem .5rem;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.04)}
.ow-anno-card.active{border-color:rgba(0,0,0,.18)}
.ow-anno-kicker{font-size:.64rem;font-weight:500;margin-bottom:.28rem;letter-spacing:.04em;opacity:.7;display:flex;align-items:center;gap:.35rem}
.ow-anno-n{min-width:16px;height:16px;border-radius:999px;background:rgba(0,0,0,.06);color:var(--ow-muted);display:inline-grid;place-items:center;font-size:.62rem;font-weight:650}
.ow-anno-change{margin:0 0 .35rem;font-size:.82rem;line-height:1.55;word-break:break-all}
.ow-anno-orig{color:var(--ow-ink);font-weight:600}
.ow-anno-arrow{color:var(--ow-faint);font-weight:400}
.ow-anno-sug{color:var(--ow-ok);font-weight:600}
.ow-anno-reason{margin:0 0 .4rem;font-size:.78rem;color:var(--ow-muted);line-height:1.55}
.ow-anno-actions{display:flex;gap:.7rem}
.ow-linkish.muted{color:var(--ow-faint);font-weight:500;text-decoration:none}
.ow-float-tools{--chip-h:32px;position:fixed;z-index:50;display:flex;align-items:center;gap:6px;height:48px;padding:0 10px 0 8px;border-radius:16px;background:rgba(255,255,255,.55);backdrop-filter:blur(22px) saturate(1.35);border:1px solid rgba(255,255,255,.65);box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 8px 28px rgba(0,0,0,.08);cursor:grab;user-select:none;touch-action:none;max-width:calc(100vw - 16px);pointer-events:auto}
.ow-float-tools:active{cursor:grabbing}
.ow-float-tools-sep{width:1px;height:18px;background:rgba(0,0,0,.1);margin:0 2px}
.ow-float-drag-handle{width:16px;height:var(--chip-h);color:var(--ow-faint);display:inline-flex;align-items:center;justify-content:center;opacity:.5}
.ow-tool-chip{box-sizing:border-box;height:var(--chip-h);padding:0 10px;border:1px solid transparent;border-radius:999px;background:transparent;font-size:.78rem;font-weight:500;display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.ow-tool-chip:hover{background:rgba(0,0,0,.05)}
.ow-toggle-chip{position:relative;border:1px solid rgba(0,0,0,.08);background:rgba(0,0,0,.03)}
.ow-toggle-chip input{position:absolute;opacity:0;width:0;height:0;pointer-events:none}
.ow-toggle-track{width:28px;height:16px;border-radius:999px;background:rgba(0,0,0,.18);position:relative;flex-shrink:0}
.ow-toggle-track::after{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:transform .18s}
.ow-toggle-chip.on{background:#000;border-color:#000;color:#fff}
.ow-toggle-chip.on .ow-toggle-track{background:rgba(255,255,255,.28)}
.ow-toggle-chip.on .ow-toggle-track::after{transform:translateX(12px)}
.ow-audit-combo{display:inline-flex;align-items:stretch;height:var(--chip-h);border-radius:999px;overflow:hidden;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.35)}
.ow-audit-combo-depth{display:inline-flex;align-items:center;gap:5px;padding:0 10px 0 8px;border:none;border-right:1px solid rgba(0,0,0,.08);background:transparent;font-size:.76rem;cursor:pointer}
.ow-audit-combo-depth.on{background:rgba(0,0,0,.88);color:#fff}
.ow-audit-combo-depth .ow-toggle-track.mini{width:22px;height:12px}
.ow-audit-combo-depth .ow-toggle-track.mini::after{top:1.5px;left:1.5px;width:9px;height:9px}
.ow-audit-combo-depth.on .ow-toggle-track.mini::after{transform:translateX(10px)}
.ow-audit-combo-run{border:none;background:#000;color:#fff;padding:0 14px;font-size:.78rem;font-weight:600;cursor:pointer;min-width:52px}
.ow-audit-combo-run:disabled,.ow-audit-combo-depth:disabled{opacity:.45;cursor:not-allowed}
.ow-toast{position:fixed;left:50%;bottom:5.5rem;transform:translateX(-50%);z-index:90;max-width:min(90vw,360px);padding:.65rem 1.15rem;border-radius:999px;background:rgba(0,0,0,.86);color:#fff;font-size:.84rem;pointer-events:none}
.ow-toast.type-success{background:rgba(22,101,52,.92)}
.ow-toast.type-error{background:rgba(153,27,27,.92)}
.ow-bubble-menu{position:fixed;z-index:55;display:flex;flex-wrap:wrap;gap:2px;max-width:min(92vw,520px);background:rgba(0,0,0,.88);color:#fff;border-radius:14px;padding:4px;transform:translateX(-50%)}
.ow-bubble-menu button{border:none;background:transparent;color:#fff;padding:.4rem .65rem;border-radius:10px;cursor:pointer;font-size:.76rem}
.ow-bubble-menu button:hover{background:rgba(255,255,255,.12)}
.ow-rewrite-source-mark{background:rgba(0,0,0,.08);box-shadow:inset 0 -2px 0 rgba(0,0,0,.2)}
.ow-rewrite-bubble{position:fixed;z-index:56;background:rgba(255,255,255,.96);backdrop-filter:blur(16px);border:1px solid rgba(0,0,0,.08);box-shadow:0 8px 28px rgba(0,0,0,.1);max-width:min(92vw,360px);pointer-events:auto}
.ow-rewrite-bubble-sm{border-radius:18px 18px 18px 6px;padding:.45rem .85rem}
.ow-rewrite-bubble-result{width:min(300px,92vw);border-radius:14px 14px 14px 6px;padding:.65rem .75rem}
.ow-rewrite-bubble-pick{width:min(340px,92vw);border-radius:14px;padding:.7rem .75rem}
.ow-rewrite-bubble-loading{display:inline-flex;align-items:center;gap:.5rem;font-size:.8rem;color:var(--ow-muted)}
.ow-rewrite-bubble-dots{display:inline-flex;gap:3px}
.ow-rewrite-bubble-dots i{width:5px;height:5px;border-radius:50%;background:#111;opacity:.35;animation:ow-pulse 1s ease-in-out infinite;display:block}
.ow-rewrite-bubble-body{display:flex;flex-direction:column;gap:.45rem}
.ow-rewrite-bubble-text{font-family:var(--ow-font-body);font-size:.88rem;line-height:1.65;max-height:160px;overflow:auto;white-space:pre-wrap}
.ow-rewrite-bubble-actions{display:flex;justify-content:flex-end;gap:.35rem}
.ow-rewrite-pop-head{display:flex;align-items:center;gap:.5rem}
.ow-rewrite-drag{cursor:grab;color:var(--ow-faint);padding:0 .15rem;user-select:none}
.ow-rewrite-drag:active{cursor:grabbing}
.ow-rewrite-pop-head strong{flex:1;font-size:.85rem}
.ow-rewrite-modes{display:flex;flex-wrap:wrap;gap:.3rem}
.ow-rewrite-modes button{border:1px solid rgba(0,0,0,.12);background:#fafafa;border-radius:999px;padding:.3rem .65rem;font-size:.74rem;cursor:pointer}
.ow-rewrite-modes button.active{background:#111;border-color:#111;color:#fff}
.ow-rewrite-bubble textarea{width:100%;border:1px solid rgba(0,0,0,.12);border-radius:10px;padding:.55rem .65rem;background:#fafafa;min-height:56px;font:inherit;font-size:.8rem}
.ow-wizard-overlay,.ow-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.28);display:grid;place-items:center;z-index:80;padding:1rem;backdrop-filter:blur(12px);pointer-events:auto}
.ow-wizard-card{width:min(560px,100%);max-height:min(90vh,780px);display:flex;flex-direction:column;background:rgba(255,255,255,.92);border-radius:20px;padding:1.5rem 1.5rem 1.15rem;border:1px solid var(--ow-line);outline:none}
.ow-wizard-brand{display:flex;gap:.85rem;align-items:center;margin-bottom:1.1rem}
.ow-wizard-logo{width:42px;height:42px;border-radius:12px;background:#111;color:#fff;display:grid;place-items:center;font-family:var(--ow-font-title);font-size:1.15rem}
.ow-wizard-brand h1{margin:0;font-size:1.1rem}
.ow-wizard-brand p{margin:.15rem 0 0;color:var(--ow-muted);font-size:.8rem}
.ow-wizard-steps{display:flex;gap:.35rem;margin-bottom:1rem}
.ow-wstep{flex:1;display:flex;align-items:center;gap:.35rem;font-size:.74rem;color:var(--ow-faint);padding:.4rem .5rem;border-radius:999px}
.ow-wstep span{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:rgba(0,0,0,.05);font-size:.68rem}
.ow-wstep.active{color:#111;background:rgba(0,0,0,.04)}
.ow-wstep.active span{background:#111;color:#fff}
.ow-wstep.done{color:var(--ow-ok)}
.ow-wizard-scroll{flex:1;min-height:0;overflow:auto}
.ow-wizard-body h2{margin:0 0 .3rem;font-size:1.02rem}
.ow-option-grid{display:grid;grid-template-columns:1fr 1fr;gap:.65rem;margin-top:.9rem}
.ow-option-card{text-align:left;border:1px solid rgba(0,0,0,.12);background:#fafafa;border-radius:14px;padding:1rem .95rem;cursor:pointer;display:flex;flex-direction:column;gap:.35rem;min-height:108px}
.ow-option-card.selected{border-color:#111;background:#fff;box-shadow:0 0 0 3px rgba(0,0,0,.06)}
.ow-option-card.encrypted.selected{border-color:#991b1b}
.ow-doc-type-list{display:flex;flex-direction:column;gap:.4rem;margin-top:.85rem}
.ow-doc-type-item{text-align:left;border:1px solid rgba(0,0,0,.12);background:#fafafa;border-radius:12px;padding:.7rem .85rem;cursor:pointer;display:grid;grid-template-columns:1fr auto}
.ow-doc-type-item.selected{border-color:#111;background:#fff}
.ow-doc-type-item .desc{font-size:.74rem;color:var(--ow-muted)}
.ow-doc-type-item .hint{font-size:.7rem;color:var(--ow-faint);grid-column:1/-1}
.ow-field-label{display:block;margin-top:.9rem;font-size:.82rem;font-weight:600}
.ow-field-label .req{color:var(--ow-danger);font-style:normal;font-size:.72rem;margin-left:.35rem}
.ow-field-label .opt{color:var(--ow-faint);font-style:normal;font-size:.72rem;margin-left:.35rem}
.ow-topic-input,.ow-root label textarea,.ow-root label input,.ow-root label select{width:100%;margin-top:.35rem;border:1px solid rgba(0,0,0,.12);border-radius:12px;padding:.7rem .85rem;background:#fafafa;font:inherit}
.ow-wizard-footer{display:flex;justify-content:space-between;margin-top:1rem;padding-top:.75rem;border-top:1px solid var(--ow-line)}
.ow-warn-banner{margin-top:.85rem;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:12px;padding:.7rem .85rem;font-size:.84rem}
.ow-linkish{border:none;background:none;color:#111;text-decoration:underline;cursor:pointer;font-weight:600}
.ow-error-text{color:var(--ow-danger);font-size:.84rem;margin-top:.5rem}
.ow-modal{width:min(640px,100%);max-height:min(88vh,760px);background:rgba(255,255,255,.94);border-radius:18px;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--ow-line)}
.ow-modal-header{display:flex;align-items:center;gap:1rem;padding:.9rem 1.15rem;border-bottom:1px solid var(--ow-line)}
.ow-modal-header h2{margin:0;font-size:.95rem;flex:1}
.ow-routing-panel{padding:1rem 1.2rem 1.2rem;overflow:auto}
.ow-row-actions{display:flex;gap:.5rem;margin-top:1rem;align-items:center;justify-content:flex-end}
.ow-confirm{width:min(420px,100%);background:#fff;border-radius:16px;padding:1.2rem 1.3rem;border:1px solid var(--ow-line)}
.ow-confirm h3{margin:0 0 .4rem}
.ow-confirm p{margin:0;color:var(--ow-muted);font-size:.86rem;line-height:1.55}
#ow-writing-nav{display:block;margin-bottom:4px;width:100%;box-sizing:border-box}
.ow-nav-group{display:flex;flex-direction:column;gap:2px;width:100%}
.ow-nav-folder,.ow-nav-doc{box-sizing:border-box;width:100%;cursor:pointer;user-select:none;color:var(--dsw-alias-label-primary,inherit);background:transparent;border-radius:8px;align-items:center;gap:6px;padding:0 8px;display:flex;flex:none;overflow:hidden;line-height:20px}
.ow-nav-folder{height:34px}
.ow-nav-folder.contains-current,.ow-nav-folder.expanded{background:transparent}
.ow-nav-folder:hover,.ow-nav-folder.menu-open{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.ow-nav-slot{width:16px;height:20px;color:var(--dsw-alias-label-tertiary,rgba(0,0,0,.45));flex:none;justify-content:center;align-items:center;display:inline-flex}
.ow-nav-icon.active{color:var(--dsw-alias-state-business-primary,#3b82f6)}
.ow-nav-folder .ow-nav-chevron{display:none}
.ow-nav-folder:hover .ow-nav-chevron{display:inline-flex}
.ow-nav-folder:hover .ow-nav-icon{display:none}
.ow-nav-arrow{transition:transform .15s;color:var(--dsw-alias-label-tertiary,rgba(0,0,0,.45))}
.ow-nav-arrow.open{transform:rotate(90deg)}
.ow-nav-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px}
.ow-nav-actions{flex:none;align-items:center;gap:12px;display:none}
.ow-nav-folder:hover .ow-nav-actions,.ow-nav-doc:hover .ow-nav-actions,.ow-nav-doc.menu-open .ow-nav-actions{display:inline-flex}
.ow-nav-icon-btn{border:none;background:transparent;width:20px;height:20px;padding:0;border-radius:6px;color:var(--dsw-alias-label-tertiary,rgba(0,0,0,.45));display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.ow-nav-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.08));color:var(--dsw-alias-label-primary,inherit)}
.ow-nav-doc{height:32px;max-height:32px;gap:0;margin:0;border:none;background:transparent;width:100%;text-align:left;font:inherit}
.ow-nav-doc:hover,.ow-nav-doc.selected,.ow-nav-doc.menu-open{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.ow-nav-doc-title{flex:1;min-width:0;margin:0 6px 0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px}
.ow-nav-menu{position:fixed;z-index:120;min-width:148px;padding:6px;border-radius:10px;background:var(--dsw-alias-bg-elevated,#fff);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));box-shadow:0 8px 24px rgba(0,0,0,.12);display:flex;flex-direction:column}
.ow-nav-menu button{border:none;background:transparent;text-align:left;padding:8px 10px;border-radius:8px;font-size:13px;cursor:pointer;color:inherit}
.ow-nav-menu button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.ow-nav-menu button.danger{color:#dc2626}
body.ow-writing-open [role="treeitem"][class*="sessionRow"][class*="selected"]{background:transparent !important}
.ow-overlay-host{position:relative;z-index:70;pointer-events:auto}
.ow-crash{position:fixed;inset:auto 24px 24px auto;z-index:90;max-width:360px;padding:12px 14px;border-radius:12px;background:#fff;border:1px solid rgba(153,27,27,.25);color:#991b1b;box-shadow:0 8px 28px rgba(0,0,0,.12);pointer-events:auto}
.ow-crash strong{display:block;margin-bottom:6px}
.ow-crash p{margin:0;font-size:13px;line-height:1.5;color:#7f1d1d}
.ow-settings-twin{box-sizing:border-box;cursor:pointer;width:auto;height:42px;color:var(--dsw-alias-label-primary);background:transparent;border:none;border-radius:12px;flex:none;align-items:center;justify-content:flex-end;gap:8px;margin:4px 0;padding:0 10px 0 8px;font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden;white-space:nowrap}
.ow-settings-twin:hover,.ow-settings-twin.on{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.ow-settings-twin.rail{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;margin:8px 0 10px;padding:0}
.ow-settings-twin span{white-space:nowrap}
[class*="_footArea"]:has(.ow-settings-twin){display:flex !important;flex-direction:row !important;align-items:stretch !important;gap:6px}
[class*="_footArea"]:has(.ow-settings-twin) [class*="_footerActions"]{order:2;flex:0 0 auto !important;width:auto !important;min-width:0}
[class*="_footArea"]:has(.ow-settings-twin) [class*="_settingsArea"]{order:1;flex:1 1 auto !important;min-width:0 !important}
[class*="_collapsed"] [class*="_footArea"]:has(.ow-settings-twin){flex-direction:column !important}
.ow-route-card{margin-top:.85rem;padding:.85rem .9rem;border:1px solid var(--ow-line);border-radius:14px;background:#fafafa}
.ow-route-card-head{display:flex;flex-direction:column;gap:.2rem;margin-bottom:.65rem}
.ow-route-card-head strong{font-size:.86rem}
.ow-route-card-head span{font-size:.74rem;color:var(--ow-muted);line-height:1.45}
.ow-route-row{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(108px,.9fr);gap:.55rem}
.ow-route-row label{margin:0;font-size:.74rem;font-weight:600;color:var(--ow-muted)}
.ow-route-row select{margin-top:.28rem}
@media (max-width:1080px){
  .ow-comment-pane{width:200px;flex-basis:200px}
  .ow-paper-body{padding:36px 36px 32px}
}
@media (max-width:860px){
  .ow-stage{gap:0;padding:1rem .75rem}
  .ow-comment-pane{display:none}
  .ow-paper-body{padding:28px 22px 40px}
  .ow-doc-scroll{max-width:none}
}
`
