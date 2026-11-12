(() => {
  'use strict';
  const TAB_LABELS={feed:'Inicio',live:'En vivo',chat:'Mensajes',lobbies:'Juegos',clubs:'Comunidades',tournaments:'Torneos',shop:'Tienda',events:'Misiones',profile:'Perfil',friends:'Amigos',saved:'Guardados',notifications:'Notificaciones',help:'Ayuda'};
  const TAB_ICONS={feed:'fa-house',live:'fa-tower-broadcast',chat:'fa-comments',lobbies:'fa-gamepad',clubs:'fa-users',tournaments:'fa-trophy',shop:'fa-store',events:'fa-calendar-star',profile:'fa-user',friends:'fa-user-group',saved:'fa-bookmark',notifications:'fa-bell'};
  const DESKTOP_TABS=['feed','live','lobbies','clubs','chat','friends','shop','tournaments','events','saved','profile','notifications'];
  const byId=id=>document.getElementById(id);
  let currentTab='feed',historyReady=false,switchingFromHistory=false;
  function addStyles(){
    if(byId('pv-omlet-navigation-styles'))return;
    const style=document.createElement('style');style.id='pv-omlet-navigation-styles';
    style.textContent=[
      '#main-app.pv-desktop-shell{display:grid!important;grid-template-columns:248px minmax(0,1fr);grid-template-rows:64px minmax(0,1fr) 70px;grid-template-areas:"rail header" "rail content" "rail bottom";height:100dvh;min-height:0}',
      '#main-app.pv-desktop-shell>header{grid-area:header;width:100%;padding-inline:1.5rem}',
      '#main-app.pv-desktop-shell>main{grid-area:content;width:100%;max-width:none;margin:0;padding:1.5rem 2rem;overscroll-behavior:contain}',
      '#main-app.pv-desktop-shell>[aria-label="Navegación principal"]{grid-area:bottom;display:none}',
      '.pv-desktop-rail{grid-area:rail;grid-row:1/4;display:flex;flex-direction:column;min-height:0;background:#0b1020;border-right:1px solid #273449;padding:18px 12px;gap:8px;z-index:32}',
      '.pv-desktop-rail .pv-rail-brand{display:flex;align-items:center;gap:10px;padding:8px 10px 20px;border-bottom:1px solid #273449;margin-bottom:8px}',
      '.pv-desktop-rail .pv-rail-links{display:flex;flex-direction:column;gap:4px;overflow:auto;min-height:0}',
      '.pv-desktop-rail button{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;padding:10px 12px;border-radius:12px;text-align:left;color:#aab6c9;font-size:13px;font-weight:650}',
      '.pv-desktop-rail button:hover{background:#172238;color:#fff}',
      '.pv-desktop-rail button[aria-current="page"]{background:rgba(255,120,65,.13);color:#ffad83;border:1px solid rgba(255,120,65,.2)}',
      '.pv-desktop-rail .pv-rail-bottom{border-top:1px solid #273449;padding-top:8px;margin-top:auto}',
      '.pv-mobile-primary-nav{height:66px;min-height:66px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:center;padding:4px 8px max(4px,env(safe-area-inset-bottom));background:rgba(10,15,28,.97);border-top:1px solid #273449;z-index:35}',
      '.pv-mobile-primary-nav button{height:54px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#93a4bc;font-size:10px;font-weight:650}',
      '.pv-mobile-primary-nav button[aria-current="page"]{color:#ff9c69}',
      '.pv-mobile-primary-nav button i{font-size:18px}',
      '.pv-mobile-primary-nav .pv-create-button{width:52px;height:52px;min-height:52px;margin-top:-16px;border:4px solid #080d18;border-radius:50%;background:linear-gradient(135deg,#ff684b,#ff9b31);color:white;font-size:20px}',
      '.pv-subnav{display:flex;gap:8px;overflow:auto;padding:4px 0 10px;scrollbar-width:none}',
      '.pv-subnav::-webkit-scrollbar{display:none}',
      '.pv-subnav button{white-space:nowrap;border:1px solid #334155;border-radius:999px;padding:8px 13px;font-size:11px;font-weight:750;color:#b9c5d7;background:#0b1220}',
      '.pv-subnav button[aria-current="true"]{border-color:#f08a54;background:rgba(240,138,84,.15);color:#ffd0b4}',
      '.pv-profile-subnav,.pv-settings-subnav{position:sticky;top:0;z-index:10;background:rgba(8,13,25,.94);backdrop-filter:blur(14px);margin:0 -4px;padding:8px 4px}',
      '@media(max-width:1023px){.pv-desktop-rail{display:none!important}#main-app.pv-desktop-shell{display:flex!important;flex-direction:column}#main-app.pv-desktop-shell>header{width:auto}#main-app.pv-desktop-shell>main{width:100%;max-width:76rem;margin:0 auto;padding:12px}#main-app.pv-desktop-shell>[aria-label="Navegación principal"]{display:grid}}',
      '@media(min-width:640px) and (max-width:1023px){#main-app.pv-desktop-shell>main{padding:20px}}',
      '@media(max-width:420px){.pv-mobile-primary-nav button span{font-size:9px}.pv-mobile-primary-nav{padding-inline:3px}}',
      '@media(min-width:1024px){#main-app.pv-desktop-shell>main>.max-w-xl{max-width:58rem}#main-app.pv-desktop-shell>main>.max-w-2xl{max-width:64rem}}'
    ].join('');
    document.head.appendChild(style);
  }
  function makeNavButton(tab,label,icon){
    const button=document.createElement('button');button.type='button';button.dataset.pvTab=tab;button.setAttribute('aria-label',label);
    button.innerHTML='<i class="fa-solid '+icon+'" aria-hidden="true"></i><span>'+label+'</span>';
    button.addEventListener('click',()=>window.switchTab(tab));return button;
  }
  function buildMobileNav(){
    const old=document.querySelector('#main-app nav[aria-label="Navegación principal"]');
    if(!old||byId('pv-mobile-primary-nav'))return;
    const nav=document.createElement('nav');nav.id='pv-mobile-primary-nav';nav.className='pv-mobile-primary-nav';nav.setAttribute('aria-label','Navegación principal');
    nav.append(makeNavButton('feed','Inicio','fa-house'),makeNavButton('live','En vivo','fa-tower-broadcast'));
    const create=document.createElement('button');create.type='button';create.className='pv-create-button';create.setAttribute('aria-label','Crear publicación o transmitir');create.innerHTML='<i class="fa-solid fa-plus" aria-hidden="true"></i>';
    create.addEventListener('click',()=>window.openActionSelector?.());nav.append(create,makeNavButton('chat','Chat','fa-comments'),makeNavButton('profile','Perfil','fa-user'));old.replaceWith(nav);
  }
  function buildDesktopRail(){
    const app=byId('main-app');if(!app||byId('pv-desktop-rail'))return;
    const rail=document.createElement('aside');rail.id='pv-desktop-rail';rail.className='pv-desktop-rail';rail.setAttribute('aria-label','Navegación de escritorio');
    const brand=document.createElement('div');brand.className='pv-rail-brand';brand.innerHTML='<span class="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 text-white"><i class="fa-solid fa-gamepad"></i></span><span><strong class="block text-sm font-black text-white">PLAYVERSE</strong><small class="text-[9px] tracking-widest text-slate-400">ARCADE COMMUNITY</small></span>';
    const links=document.createElement('div');links.className='pv-rail-links';
    DESKTOP_TABS.forEach(tab=>{const b=document.createElement('button');b.type='button';b.dataset.pvTab=tab;b.innerHTML='<i class="fa-solid '+TAB_ICONS[tab]+' w-5 text-center"></i><span>'+TAB_LABELS[tab]+'</span>';b.addEventListener('click',()=>window.switchTab(tab));links.appendChild(b);});
    const bottom=document.createElement('div');bottom.className='pv-rail-bottom';
    const settings=document.createElement('button');settings.type='button';settings.innerHTML='<i class="fa-solid fa-gear w-5 text-center"></i><span>Configuración</span>';settings.addEventListener('click',()=>window.openSettingsModal?.());
    const logout=document.createElement('button');logout.type='button';logout.innerHTML='<i class="fa-solid fa-right-from-bracket w-5 text-center"></i><span>Cerrar sesión</span>';logout.addEventListener('click',()=>window.logout?.());bottom.append(settings,logout);rail.append(brand,links,bottom);app.insertBefore(rail,app.firstChild);
  }
  function updateActiveNavigation(tab){document.querySelectorAll('[data-pv-tab]').forEach(b=>{if(b.dataset.pvTab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});}
  function installRouter(){
    if(typeof window.switchTab!=='function'||window.switchTab.__pvRouterInstalled)return;
    const original=window.switchTab;
    const wrapped=function(tab){if(!TAB_LABELS[tab])return;original.call(this,tab);currentTab=tab;updateActiveNavigation(tab);if(!switchingFromHistory&&historyReady)history.pushState({pvTab:tab},'','#'+tab);};
    wrapped.__pvRouterInstalled=true;window.switchTab=wrapped;
    const hash=location.hash.slice(1);if(TAB_LABELS[hash]){currentTab=hash;original.call(window,hash);}
    history.replaceState({...history.state,pvTab:currentTab},'','#'+currentTab);historyReady=true;
    window.addEventListener('popstate',event=>{const target=event.state?.pvTab||'feed';if(!TAB_LABELS[target])return;switchingFromHistory=true;currentTab=target;original.call(window,target);updateActiveNavigation(target);switchingFromHistory=false;});
    updateActiveNavigation(currentTab);
  }
  function createSubnav(className,entries,onSelect){
    const nav=document.createElement('nav');nav.className='pv-subnav '+className;nav.setAttribute('aria-label',className.includes('profile')?'Secciones del perfil':'Secciones de configuración');
    entries.forEach((entry,index)=>{const b=document.createElement('button');b.type='button';b.textContent=entry.label;b.setAttribute('aria-current',index===0?'true':'false');b.addEventListener('click',()=>{nav.querySelectorAll('button').forEach(x=>x.setAttribute('aria-current','false'));b.setAttribute('aria-current','true');onSelect(entry);});nav.appendChild(b);});return nav;
  }
  function installProfileSections(){
    const profile=byId('tab-profile');if(!profile||byId('pv-profile-subnav'))return;
    const entries=[{label:'Perfil',target:'profile-card'},{label:'Logros',target:'profile-achievement-list'},{label:'Publicaciones',target:'profile-post-list'},{label:'Actividad',target:'profile-activity-list'},{label:'Estadísticas',target:'profile-stat-posts'}];
    const nav=createSubnav('pv-profile-subnav',entries,e=>{const target=byId(e.target);(target?.closest('section')||target)?.scrollIntoView({behavior:'smooth',block:'start'});});
    nav.id='pv-profile-subnav';profile.insertBefore(nav,profile.firstChild);
  }
  function installSettingsSections(){
    const form=byId('streaming-settings-form');if(!form||byId('pv-settings-subnav'))return;
    const sections=Array.from(form.querySelectorAll(':scope > section'));
    const entries=sections.map((section,i)=>{if(!section.id)section.id='pv-settings-section-'+i;const h=section.querySelector('h4');return{label:(h?.textContent||'Opciones '+(i+1)).replace(/\s+/g,' ').trim().replace(' · Stream Overlays 2.0','').slice(0,22),target:section.id};});
    const nav=createSubnav('pv-settings-subnav',entries,e=>byId(e.target)?.scrollIntoView({behavior:'smooth',block:'start'}));nav.id='pv-settings-subnav';
    const heading=form.querySelector(':scope > div');if(heading)heading.insertAdjacentElement('afterend',nav);
  }
  function normalizeBrandCopy(){const label=document.querySelector('#drawer-panel .tracking-\\[\\.2em\\]');if(label&&/Omlet Arcade/i.test(label.textContent))label.textContent='TU ESPACIO PLAYVERSE';}
  function install(){addStyles();buildMobileNav();buildDesktopRail();installRouter();installProfileSections();installSettingsSections();normalizeBrandCopy();byId('main-app')?.classList.add('pv-desktop-shell');}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();