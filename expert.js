'use strict';

/* Practical reliability and best-condition advisor.
   This file intentionally sits above the existing calculators. It reads DOM
   inputs/results, scores risk, and explains what to change before production. */
(function(){
  const PREF_KEY = 'machiningExpertPrefs.v1';

  const MATERIAL_META = {
    al:      {group:'N', difficulty:0.75, sticky:true,  heat:false, abrasiveness:0.4, label:'A2017 / aluminum'},
    al7075:  {group:'N', difficulty:0.85, sticky:true,  heat:false, abrasiveness:0.5, label:'A7075'},
    steel:   {group:'P', difficulty:1.00, sticky:false, heat:false, abrasiveness:0.7, label:'carbon steel'},
    steel_h: {group:'P', difficulty:1.35, sticky:false, heat:true,  abrasiveness:1.0, label:'SCM440 HRC30'},
    steel_hh:{group:'H', difficulty:1.80, sticky:false, heat:true,  abrasiveness:1.4, label:'hardened steel'},
    sus304:  {group:'M', difficulty:1.55, sticky:true,  heat:true,  abrasiveness:0.9, label:'SUS304'},
    sus316:  {group:'M', difficulty:1.65, sticky:true,  heat:true,  abrasiveness:0.9, label:'SUS316L'},
    cast:    {group:'K', difficulty:0.95, sticky:false, heat:false, abrasiveness:1.0, label:'cast iron'},
    ti:      {group:'S', difficulty:1.85, sticky:true,  heat:true,  abrasiveness:1.2, label:'titanium'},
    ni:      {group:'S', difficulty:2.25, sticky:true,  heat:true,  abrasiveness:1.5, label:'nickel alloy'},
    cu:      {group:'N', difficulty:0.70, sticky:true,  heat:false, abrasiveness:0.3, label:'copper/brass'},
    cfrp:    {group:'N', difficulty:1.20, sticky:false, heat:false, abrasiveness:1.8, label:'CFRP'}
  };

  const TOOL_RULE = {
    hss:     {rigidity:0.65, heat:0.55, brittle:0.30, label:'HSS'},
    cobalt:  {rigidity:0.70, heat:0.65, brittle:0.35, label:'Co-HSS'},
    carbide: {rigidity:1.00, heat:0.85, brittle:0.75, label:'carbide'},
    coated:  {rigidity:1.00, heat:0.95, brittle:0.75, label:'coated carbide'},
    altin:   {rigidity:1.00, heat:1.00, brittle:0.78, label:'AlTiN'},
    altisiN: {rigidity:1.00, heat:1.05, brittle:0.80, label:'AlTiSiN'},
    diamond: {rigidity:0.95, heat:0.70, brittle:0.65, label:'DLC/diamond'},
    pcd:     {rigidity:0.95, heat:0.70, brittle:0.65, label:'PCD'},
    cermet:  {rigidity:0.80, heat:0.90, brittle:0.90, label:'cermet'},
    cbn:     {rigidity:0.90, heat:1.15, brittle:0.95, label:'CBN'}
  };

  const PROC_TARGET = {
    rough:  {loadLo:45, loadHi:75, stressHi:75, lifeMin:12, label:'roughing'},
    semi:   {loadLo:35, loadHi:65, stressHi:65, lifeMin:18, label:'semi-finishing'},
    finish: {loadLo:20, loadHi:50, stressHi:55, lifeMin:25, label:'finishing'}
  };

  const DEFAULT_PREFS = {priority:'balanced', rigidity:'normal', clamp:'normal', targetRa:3.2, inspector:'on'};
  let prefs = loadPrefs();
  let lastReport = null;

  function $(id){ return document.getElementById(id); }
  function q(sel, root){ return (root||document).querySelector(sel); }
  function qa(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function num(id){
    const el=$(id);
    if(!el) return 0;
    const raw = String(el.value || el.textContent || '').replace(/[^\d.+-]/g,'');
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : 0;
  }
  function val(id){ const el=$(id); return el ? el.value : ''; }
  function txt(id){ const el=$(id); return el ? el.textContent || el.value || '' : ''; }
  function round(v,d){ const m=Math.pow(10,d||0); return Math.round((v||0)*m)/m; }
  function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function loadPrefs(){
    try { return Object.assign({}, DEFAULT_PREFS, JSON.parse(localStorage.getItem(PREF_KEY)||'{}')); }
    catch(e){ return Object.assign({}, DEFAULT_PREFS); }
  }
  function savePrefs(){
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch(e) {}
  }

  function activeTab(){
    const active = q('.tab-content.active');
    if(!active || !active.id) return 'milling';
    return active.id.replace(/^tab_/,'');
  }

  function processValues(tab){
    const map = {
      milling:   {pre:'m',  kind:'milling',   D:'m_D',  mat:'m_mat',  tool:'m_tool',  proc:'m_proc',  cool:'m_cool',  ap:'m_ap',  ae:'m_ae',  OH:'m_OH',  motor:'m_motor',  eta:'m_eta',  nmax:'m_nmax',  feed:'m_fz',  rpm:'m_S_prev'},
      facemill:  {pre:'fm', kind:'facemill',  D:'fm_D', mat:'fm_mat', tool:'fm_grade',proc:'rough',   cool:'fm_cool', ap:'fm_ap', ae:'fm_ae', OH:null,    motor:'fm_motor', eta:'fm_eta', nmax:'fm_nmax', feed:'fm_fz', rpm:null},
      indexable: {pre:'ie', kind:'indexable', D:'ie_D', mat:'ie_mat', tool:'ie_grade',proc:'ie_proc',  cool:'ie_cool', ap:'ie_ap', ae:'ie_ae', OH:null,    motor:'ie_motor', eta:'ie_eta', nmax:'ie_nmax', feed:'ie_fz', rpm:null},
      hf:        {pre:'hf', kind:'highfeed',  D:'hf_D', mat:'hf_mat', tool:'hf_grade',proc:'hf_proc',  cool:'hf_cool', ap:'hf_ap', ae:'hf_ae', OH:null,    motor:'hf_motor', eta:'hf_eta', nmax:'hf_nmax', feed:'hf_fz', rpm:null},
      drilling:  {pre:'d',  kind:'drilling',  D:'d_D',  mat:'d_mat',  tool:'d_tool',  proc:'rough',   cool:'d_cool',  ap:null,   ae:null,   OH:'d_L',   motor:'d_motor',  eta:'d_eta',  nmax:'d_nmax',  feed:'d_f',   rpm:'d_S'},
      turning:   {pre:'t',  kind:'turning',   D:'t_D',  mat:'t_mat',  tool:'t_tool',  proc:'t_proc',   cool:'t_cool',  ap:'t_ap', ae:null,   OH:null,    motor:'t_motor',  eta:'t_eta',  nmax:'t_nmax',  feed:'t_f',   rpm:'t_S'},
      boring:    {pre:'b',  kind:'boring',    D:'b_D',  mat:'b_mat',  tool:'b_tool',  proc:'b_proc',   cool:'b_cool',  ap:'b_ap', ae:null,   OH:'b_OH',  motor:'b_motor',  eta:'b_eta',  nmax:'b_nmax',  feed:'b_f',   rpm:'b_S'},
      tap:       {pre:'tap',kind:'tap',       D:null,   mat:'tap_mat',tool:'tap_tool',proc:'tap',      cool:'tap_cool',ap:null,   ae:null,   OH:'tap_depth',motor:null, eta:null,    nmax:'tap_nmax', feed:'tap_F',   rpm:'tap_S'}
    };
    const cfg = map[tab] || map.milling;
    const mat = val(cfg.mat) || 'steel';
    const proc = cfg.proc && $(cfg.proc) ? val(cfg.proc) : cfg.proc || 'rough';
    const feedRaw = cfg.feed ? num(cfg.feed) : 0;
    const D = cfg.kind==='tap' ? threadValue('D') : num(cfg.D);
    const pitch = cfg.kind==='tap' ? threadValue('P') : 0;
    const ap = cfg.ap ? num(cfg.ap) : 0;
    const ae = cfg.ae ? num(cfg.ae) : 0;
    const OH = cfg.OH ? num(cfg.OH) : 0;
    const rpm = cfg.rpm ? num(cfg.rpm) : 0;
    const load = readPercent(cfg.pre, ['load','torq']);
    const stress = readPercent(cfg.pre, ['stress']);
    const life = readLife(cfg.pre);
    const vc = num(cfg.pre + '_Vc') || estimateVc(D, rpm);
    return {
      tab, pre:cfg.pre, kind:cfg.kind, D, pitch, mat, meta:MATERIAL_META[mat]||MATERIAL_META.steel,
      tool:val(cfg.tool)||'carbide', proc, cool:val(cfg.cool)||'wet', ap, ae, OH,
      feed:feedRaw, rpm, vc, motor:cfg.motor?num(cfg.motor):0, eta:cfg.eta?num(cfg.eta):0.8,
      nmax:cfg.nmax?num(cfg.nmax):0, load, stress, life
    };
  }

  function threadValue(key){
    try {
      const tkey = val('tap_thread') || 'M6_1.0';
      const th = (typeof THREADS !== 'undefined' && THREADS[tkey]) ? THREADS[tkey] : null;
      return th ? Number(th[key] || 0) : 0;
    } catch(e){ return 0; }
  }

  function readPercent(pre, keys){
    const ids = [];
    keys.forEach(k => {
      ids.push(pre + '_pct_' + k);
      ids.push(pre + '_bar_' + k);
    });
    for(const id of ids){
      const t = txt(id);
      const m = t.match(/(\d+(?:\.\d+)?)\s*%/);
      if(m) return parseFloat(m[1]);
    }
    const verdict = txt(pre + '_verdict');
    const all = verdict.match(/(\d+(?:\.\d+)?)\s*%/g);
    if(all && all.length) return parseFloat(all[0]);
    return 0;
  }

  function readLife(pre){
    const t = txt(pre + '_verdict') + ' ' + txt(pre + '_rg') + ' ' + txt(pre + '_phys_grid');
    const m = t.match(/(\d+(?:\.\d+)?)\s*min/i);
    return m ? parseFloat(m[1]) : 0;
  }

  function estimateVc(D, rpm){
    return (D>0 && rpm>0) ? round(Math.PI*D*rpm/1000,1) : 0;
  }

  function scoreReport(v){
    const issues = [];
    const actions = [];
    const positives = [];
    let score = 100;
    const target = PROC_TARGET[v.proc] || PROC_TARGET.rough;
    const mat = v.meta;
    const tool = TOOL_RULE[v.tool] || TOOL_RULE.carbide;
    const rigidFactor = prefs.rigidity==='heavy' ? 1.10 : prefs.rigidity==='light' ? 0.82 : 1.0;
    const clampFactor = prefs.clamp==='strong' ? 1.08 : prefs.clamp==='weak' ? 0.82 : 1.0;
    const setupFactor = rigidFactor * clampFactor;

    if(!v.D || v.D<=0){
      add(18,'crit','主要寸法が未入力です。工具径または加工径を入力してください。','寸法を入力してから条件を確定');
    }

    if(mat.difficulty>1.6) add(5,'warn','難削材です。速度・発熱・加工硬化のばらつきを大きめに見ます。','初回は推奨値から 10-20% 落として試削');
    if(mat.sticky && (v.cool==='dry' || v.cool==='air')) add(12,'warn','粘い材料をドライ寄りで加工しています。溶着・加工硬化のリスクがあります。','水溶性/油性/MQLを検討し、エアで切りくずを確実に排出');
    if(v.mat==='cast' && v.cool==='wet') add(4,'info','鋳鉄の水溶性はスラッジ管理が重要です。','乾式または集じん/濾過を確認');

    if((v.tool==='diamond'||v.tool==='pcd') && ['steel','steel_h','steel_hh','sus304','sus316','ti','ni'].includes(v.mat)){
      add(22,'crit','PCD/ダイヤ系は鉄系・難削材で摩耗や化学反応リスクが高い組み合わせです。','Al/Cu/CFRP向けに限定し、鉄系は超硬/CBNへ変更');
    }
    if(v.tool==='hss' && ['steel_h','steel_hh','ti','ni'].includes(v.mat)){
      add(14,'warn','HSSでは耐熱・剛性余裕が小さい材料です。','Co-HSSまたは超硬、低速高潤滑へ変更');
    }
    if(v.tool==='cbn' && !['steel_hh','cast'].includes(v.mat)){
      add(8,'info','CBNは硬質材・鋳鉄向きです。一般材では費用対効果が落ちる場合があります。','通常は超硬/コーティング超硬を優先');
    }

    if(v.load>0){
      const loadHi = target.loadHi * setupFactor;
      const loadLo = target.loadLo * (prefs.priority==='productivity'?0.8:1);
      if(v.load>100) add(30,'crit','機械出力が不足しています。計算上は加工不可です。','ap/ae/feed/Vc の順で下げ、負荷 70%以下へ');
      else if(v.load>loadHi+10) add(14,'warn','機械負荷が高めです。連続加工や工具摩耗時に破綻しやすい条件です。','負荷を 55-75% へ調整');
      else if(v.load<loadLo && prefs.priority==='productivity') {
        add(0,'ok','機械負荷に余裕があります。剛性が十分なら送りまたは切込みを上げられます。','送り +5-15% から段階確認');
      } else positives.push('機械負荷は目標域です');
    }

    if(v.stress>0){
      const stressHi = target.stressHi * setupFactor;
      if(v.stress>100) add(28,'crit','工具/バーの応力が許容を超えています。','突き出し短縮、切込み低減、工具径アップ');
      else if(v.stress>stressHi) add(12,'warn','工具応力が高めです。摩耗後や断続で欠けやすくなります。','応力 60-75% 以下を目標');
      else positives.push('工具応力は許容範囲です');
    }

    if(v.life>0){
      if(v.life<target.lifeMin) add(8,'warn','Taylor寿命が短めです。量産では工具交換頻度が高くなります。','Vc を 5-15% 下げて寿命を確保');
      else positives.push('工具寿命の目安は十分です');
    }

    processSpecific(v, issues, actions, positives, add, setupFactor);

    if(prefs.priority==='finish') {
      const rz = estimateRz(v);
      if(rz>0 && prefs.targetRa>0 && rz/4>prefs.targetRa){
        add(10,'warn','理論面粗さが目標より粗い可能性があります。','送りを下げる、ノーズR/ボールRを大きくする、仕上げパスを追加');
      }
    }

    if(issues.length===0) positives.push('入力値から見える範囲では重大リスクなし');
    score = clamp(score - issues.reduce((sum,i)=>sum+i.penalty,0), 0, 100);
    const level = score>=88 ? 'ok' : score>=72 ? 'warn' : score>=55 ? 'ng' : 'crit';
    const headline = score>=88 ? '量産前提で使える条件' : score>=72 ? '試削確認後に使える条件' : score>=55 ? '要調整: そのまま量産は危険' : '加工不可寄り: 条件を組み直し';
    const best = bestConditionPlan(v, issues, target, setupFactor);
    return {score, level, headline, issues, actions:dedupe(actions), positives:dedupe(positives), best, values:v};

    function add(penalty, severity, message, action){
      issues.push({penalty, severity, message, action});
      if(action) actions.push(action);
    }
  }

  function processSpecific(v, issues, actions, positives, add, setupFactor){
    if(['milling','facemill','indexable','highfeed'].includes(v.kind)){
      if(v.ae && v.D && v.ae>v.D) add(30,'crit','ae が工具径を超えています。側面切削条件として成立しません。','ae を D 以下にする');
      const oh = v.OH || (v.kind==='milling' && v.D ? 3*v.D : 0);
      const ohd = v.D ? oh/v.D : 0;
      if(v.kind==='milling' && ohd>5) add(18,'crit','エンドミル突出しが長すぎます。びびり・折損リスクが高いです。','OH/D 3以下、長くても4以下へ');
      else if(v.kind==='milling' && ohd>3.5) add(9,'warn','突出しがやや長めです。','送り/切込みを抑え、ホルダを短くする');
      if(v.ae && v.D && v.ae/v.D<0.08) add(5,'info','低い径方向切込みです。切りくず薄化により送り不足だと擦ります。','chip thinning補正後の実切りくず厚みを確認');
      if(v.ap && v.D && v.ap/v.D>1.5 && v.proc!=='finish') add(9,'warn','軸方向切込みが深めです。熱とたわみが増えます。','apを分割し、ae/feedとの総負荷で調整');
    }

    if(v.kind==='drilling'){
      const ld = v.D ? v.OH/v.D : 0;
      if(ld>10) add(24,'crit','深穴域です。通常ドリル条件では切りくず詰まりが危険です。','ステップ/ガンドリル/内部給油を検討');
      else if(ld>5) add(12,'warn','穴深さが 5D を超えます。切りくず排出と曲がりに注意。','ペック、内部給油、送り低減を設定');
      if(v.mat.sticky && v.cool==='dry') add(12,'warn','粘い材料の穴あけでドライは焼き付きやすいです。','水溶性高圧または油性を使用');
    }

    if(v.kind==='tap'){
      const tkey = val('tap_thread') || '';
      const typeKey = val('tap_type') || '';
      const hole = val('tap_hole') || '';
      const P = v.pitch || 0;
      const depth = num('tap_depth');
      const le = num('tap_le');
      if(hole==='blind' && P && depth-le < 2*P) add(18,'crit','止まり穴の逃げ深さが不足しています。底当たり折損の恐れがあります。','有効ねじ長 + 2P 以上の逃げを確保');
      if(typeKey==='form' && ['ti','ni','steel_hh'].includes(v.mat)) add(18,'crit','転造タップに厳しい材料です。トルク急増の可能性があります。','切削タップへ変更');
      if(tkey.indexOf('Rc')===0 && typeKey!=='pipe_taper') add(14,'warn','Rc 管用テーパねじにタップ種類が合っていません。','管用テーパタップを選択');
      if(tkey.indexOf('G')===0 && !['pipe_str','pipe_sp'].includes(typeKey)) add(10,'warn','G 管用平行ねじに通常タップが選択されています。','管用平行タップを選択');
      if(v.rpm && v.nmax && v.rpm>=v.nmax) add(4,'info','主軸上限で回転が制限されています。','実Vcが推奨域内か確認');
    }

    if(v.kind==='turning'){
      const shape = val('t_shape');
      const re = parseFloat(val('t_re')||'0.8') || 0.8;
      if(['D','V'].includes(shape) && v.ap>2) add(8,'warn','小さいノーズ角で切込みが大きめです。先端欠損に注意。','C/W/S形状またはap低減');
      const rz = v.feed && re ? (v.feed*v.feed/(8*re))*1000 : 0;
      if(v.proc==='finish' && rz>12) add(8,'warn','仕上げとして理論面粗さが粗めです。','送り低減またはノーズR増加');
    }

    if(v.kind==='boring'){
      const dbar = num('b_dbar');
      const ld = dbar ? (v.OH||0)/dbar : 0;
      const bar = val('b_bar') || 'steel';
      const limits = {steel:4, hm_steel:6, carbide:8, damped:10};
      const lim = limits[bar] || 4;
      if(ld>lim*1.25) add(24,'crit','ボーリングバーの L/D が推奨を大きく超えています。','防振バー/超硬バー/バー径アップ/突出し短縮');
      else if(ld>lim) add(12,'warn','ボーリングバーが推奨 L/D を超えています。','Vcと送りを落とし、防振対策');
    }
  }

  function estimateRz(v){
    if(v.kind==='turning' || v.kind==='boring'){
      const re = parseFloat(val(v.pre + '_re')||'0.8') || 0.8;
      return v.feed && re ? (v.feed*v.feed/(8*re))*1000 : 0;
    }
    if(v.kind==='milling' && v.ae && v.D) return v.ae*v.ae/(8*v.D)*1000;
    return 0;
  }

  function bestConditionPlan(v, issues, target, setupFactor){
    const critical = issues.some(i=>i.severity==='crit');
    const loadTxt = v.load ? `${round(v.load,0)}%` : 'not calculated';
    const stressTxt = v.stress ? `${round(v.stress,0)}%` : 'not calculated';
    const stable = !critical && (!v.load || v.load<target.loadHi*setupFactor+8) && (!v.stress || v.stress<target.stressHi*setupFactor+8);
    const lines = [];
    if(critical){
      lines.push('First remove red risks. Do not chase MRR until geometry, tool, and machine limits are valid.');
    } else if(prefs.priority==='productivity'){
      lines.push(`Aim for load ${target.loadLo}-${target.loadHi}% and tool stress below ${target.stressHi}%. Current load ${loadTxt}, stress ${stressTxt}.`);
      if(v.load && v.load<target.loadLo) lines.push('There is output margin. Increase feed first, then ae/ap, in 5-10% steps while watching sound and chips.');
      else lines.push('You are near the productive zone. Keep Vc stable and tune feed/cut width in small steps.');
    } else if(prefs.priority==='finish'){
      lines.push('Prioritize stable contact, low runout, fresh edge, and a final light pass over maximum MRR.');
      lines.push('Reduce feed if theoretical Ra/Rz is above target, and avoid very low chip thickness that causes rubbing.');
    } else if(prefs.priority==='stable'){
      lines.push(`Keep load around 40-60% and stress below ${Math.min(65,target.stressHi)}% for first-piece reliability.`);
      lines.push('Use shorter overhang, stronger clamping, and coolant/chip evacuation before increasing speed.');
    } else {
      lines.push(`Balanced target: load ${target.loadLo}-${target.loadHi}%, stress below ${target.stressHi}%, no red warnings.`);
      lines.push(stable ? 'Current condition is close to practical use. Confirm with first-piece sound, chips, spindle load, and size.' : 'Tune down the largest risk factor first, then re-run calculation.');
    }
    return lines;
  }

  function dedupe(arr){
    return Array.from(new Set(arr.filter(Boolean))).slice(0,8);
  }

  function renderAdvisor(){
    if(prefs.inspector==='off') return;
    const host = ensurePanel();
    if(!host) return;
    const v = processValues(activeTab());
    const report = scoreReport(v);
    lastReport = report;
    const issueHtml = report.issues.length
      ? report.issues.sort((a,b)=>sevRank(b.severity)-sevRank(a.severity) || b.penalty-a.penalty).slice(0,7).map(i =>
          `<li class="mx-i ${i.severity}"><b>${labelSeverity(i.severity)}</b>${esc(i.message)}${i.action?`<span>${esc(i.action)}</span>`:''}</li>`).join('')
      : '<li class="mx-i ok"><b>OK</b>重大な危険因子は見つかりません。<span>初回は音・切りくず・負荷・寸法を確認してください。</span></li>';
    host.innerHTML = `
      <div class="mx-head">
        <div>
          <div class="mx-kicker">Practical reliability inspector</div>
          <h2>${esc(report.headline)}</h2>
        </div>
        <div class="mx-score ${report.level}">
          <span>${round(report.score,0)}</span><small>/100</small>
        </div>
      </div>
      <div class="mx-controls">
        ${control('priority','優先','balanced:標準,stable:安定,productivity:生産性,finish:仕上げ')}
        ${control('rigidity','機械剛性','normal:標準,light:軽剛性,heavy:高剛性')}
        ${control('clamp','保持','normal:標準,weak:弱い,strong:強い')}
        <label>目標Ra<input id="mx_targetRa" type="number" value="${esc(prefs.targetRa)}" step="0.1"></label>
        <button type="button" id="mx_refresh">再評価</button>
      </div>
      <div class="mx-grid">
        <div class="mx-box"><h3>危険因子</h3><ul>${issueHtml}</ul></div>
        <div class="mx-box"><h3>最高条件への寄せ方</h3>${report.best.map(x=>`<p>${esc(x)}</p>`).join('')}</div>
        <div class="mx-box"><h3>現場チェック</h3>${checklist(report.values).map(x=>`<p>${esc(x)}</p>`).join('')}</div>
      </div>`;
    bindPanel(host);
  }

  function control(id,label,options){
    const opts = options.split(',').map(p=>{
      const kv=p.split(':');
      return `<option value="${kv[0]}" ${prefs[id]===kv[0]?'selected':''}>${kv[1]}</option>`;
    }).join('');
    return `<label>${label}<select id="mx_${id}">${opts}</select></label>`;
  }

  function checklist(v){
    const list = [];
    list.push('工具突き出し、ホルダ把握長、振れを実測');
    list.push('初回は主軸負荷・音・切りくず色/形状を確認');
    if(v.kind==='tap') list.push('下穴径、逃げ深さ、同期送り、タップホルダを確認');
    if(v.kind==='drilling') list.push('切りくず排出、ペック量、貫通直前の送り低減を確認');
    if(v.kind==='boring') list.push('L/D、バー締結、刃先高さ、逃げ面干渉を確認');
    if(v.meta.sticky) list.push('溶着・加工硬化を避けるため刃先を擦らせない');
    return list.slice(0,5);
  }

  function ensurePanel(){
    let host = $('mx_advisor');
    if(host) return host;
    const anchor = q('.tab-outer') || q('header') || q('.container');
    if(!anchor || !anchor.parentNode) return null;
    host = document.createElement('section');
    host.id = 'mx_advisor';
    host.className = 'mx-advisor';
    anchor.parentNode.insertBefore(host, anchor.nextSibling);
    return host;
  }

  function bindPanel(host){
    ['priority','rigidity','clamp'].forEach(k=>{
      const el = $('mx_' + k);
      if(el) el.onchange = () => { prefs[k]=el.value; savePrefs(); renderAdvisor(); };
    });
    const ra = $('mx_targetRa');
    if(ra) ra.oninput = () => { prefs.targetRa=parseFloat(ra.value)||0; savePrefs(); };
    const ref = $('mx_refresh');
    if(ref) ref.onclick = renderAdvisor;
  }

  function labelSeverity(s){
    return s==='crit' ? 'NG' : s==='warn' ? '注意' : s==='info' ? '確認' : 'OK';
  }
  function sevRank(s){ return s==='crit'?4:s==='warn'?3:s==='info'?2:1; }

  function injectStyles(){
    if($('mx_style')) return;
    const st=document.createElement('style');
    st.id='mx_style';
    st.textContent = `
      .mx-advisor{background:linear-gradient(180deg,rgba(15,23,42,.98),rgba(30,41,59,.96));border:1px solid rgba(148,163,184,.28);border-radius:12px;margin:0 0 16px;padding:14px;box-shadow:0 8px 28px rgba(0,0,0,.28)}
      .mx-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
      .mx-kicker{font-size:10px;color:#93c5fd;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      .mx-head h2{font-size:16px;margin:2px 0 0;color:#f8fafc}
      .mx-score{min-width:92px;text-align:center;border-radius:10px;padding:8px 10px;border:1px solid}
      .mx-score span{font-size:28px;font-weight:900;line-height:1}.mx-score small{font-size:11px;color:#cbd5e1}
      .mx-score.ok{background:rgba(22,163,74,.18);border-color:#22c55e;color:#86efac}.mx-score.warn{background:rgba(217,119,6,.18);border-color:#f59e0b;color:#fde68a}.mx-score.ng{background:rgba(220,38,38,.16);border-color:#ef4444;color:#fca5a5}.mx-score.crit{background:rgba(124,58,237,.20);border-color:#a855f7;color:#ddd6fe}
      .mx-controls{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:end}.mx-controls label{font-size:10px;color:#94a3b8;display:flex;flex-direction:column;gap:3px}.mx-controls select,.mx-controls input{background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:7px;padding:6px 8px;font-size:12px}.mx-controls button{background:#2563eb;color:white;border:0;border-radius:7px;padding:7px 12px;font-weight:700;cursor:pointer}
      .mx-grid{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:10px}.mx-box{background:rgba(15,23,42,.68);border:1px solid rgba(148,163,184,.18);border-radius:8px;padding:10px}.mx-box h3{font-size:12px;color:#e2e8f0;margin:0 0 8px}.mx-box p{font-size:11px;line-height:1.7;color:#cbd5e1;margin:0 0 6px}.mx-box ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
      .mx-i{font-size:11px;line-height:1.55;color:#cbd5e1;border-left:3px solid #64748b;padding:6px 8px;background:rgba(15,23,42,.72);border-radius:6px}.mx-i b{display:inline-block;margin-right:6px}.mx-i span{display:block;color:#94a3b8;margin-top:2px}.mx-i.crit{border-color:#a855f7}.mx-i.warn{border-color:#f59e0b}.mx-i.info{border-color:#38bdf8}.mx-i.ok{border-color:#22c55e}
      @media(max-width:980px){.mx-grid{grid-template-columns:1fr}.mx-head{align-items:flex-start}.mx-score{min-width:76px}.mx-controls label{min-width:120px}}
      @media print{.mx-controls{display:none}.mx-advisor{break-inside:avoid}}
    `;
    document.head.appendChild(st);
  }

  function hookFunctions(){
    ['refreshM','refreshFM','refreshIE','refreshHF','refreshD','refreshT','refreshTap','refreshBoring',
     'calcM','calcFM','calcIE','calcHF','calcD','calcT','calcTap','calcBoring','switchMain'].forEach(name=>{
      const fn = window[name];
      if(typeof fn !== 'function' || fn.__mxHooked) return;
      const wrapped = function(){
        const ret = fn.apply(this, arguments);
        setTimeout(renderAdvisor, 0);
        return ret;
      };
      wrapped.__mxHooked = true;
      window[name]=wrapped;
    });

    if(typeof window.addCompare === 'function' && !window.addCompare.__mxHooked){
      const oldAdd = window.addCompare;
      const wrappedAdd = function(row){
        try {
          const report = lastReport || scoreReport(processValues(activeTab()));
          row.reliability = round(report.score,0);
          row.verdict = report.headline;
        } catch(e) {}
        return oldAdd.apply(this, arguments);
      };
      wrappedAdd.__mxHooked = true;
      window.addCompare = wrappedAdd;
    }

    if(typeof window.renderCompare === 'function' && !window.renderCompare.__mxHooked){
      const oldRender = window.renderCompare;
      const wrappedRender = function(){
        try {
          if(typeof compareData === 'undefined' || !Array.isArray(compareData)) {
            return oldRender.apply(this, arguments);
          }
          const ct = $('compare_table');
          if(!ct) return;
          if(compareData.length===0){
            ct.innerHTML='<p style="color:var(--txt3);font-size:12px">各タブで計算を実行してください</p>';
            return;
          }
          let h='<table class="cmp-table"><tr><th>#</th><th>種別</th><th>材料</th><th>D</th><th>Vc</th><th>S</th><th>fz/f</th><th>F</th><th>Pc</th><th>負荷</th><th>MRR</th><th>寿命</th><th>信頼度</th><th>判定</th></tr>';
          compareData.forEach((r,i)=>{
            const rel = r.reliability==null ? '-' : r.reliability;
            const relColor = rel==='-' ? '#cbd5e1' : rel>=88 ? '#86efac' : rel>=72 ? '#fde68a' : rel>=55 ? '#fca5a5' : '#ddd6fe';
            h += `<tr><td>${i+1}</td><td>${esc(r.type)}</td><td>${esc(r.mat)}</td><td>${esc(r.D)}mm</td>
              <td>${esc(r.Vc)}m/min</td><td>${esc(r.S)}rpm</td><td class="hi">${esc(r.fz)}mm</td><td class="hi">${esc(r.F)}mm/min</td>
              <td>${esc(r.Pc)}kW</td><td style="color:${Number(r.load)>80?'#fca5a5':Number(r.load)>60?'#fcd34d':'#86efac'}">${esc(r.load)}%</td>
              <td>${esc(r.MRR)}</td><td>${esc(r.T)}</td><td style="font-weight:800;color:${relColor}">${esc(rel)}</td><td>${esc(r.verdict || (r.ok?'OK':'要注意'))}</td></tr>`;
          });
          ct.innerHTML=h+'</table>';
        } catch(e) {
          return oldRender.apply(this, arguments);
        }
      };
      wrappedRender.__mxHooked = true;
      window.renderCompare = wrappedRender;
    }
  }

  function observeInputs(){
    document.addEventListener('input', debounce(renderAdvisor, 120), true);
    document.addEventListener('change', debounce(renderAdvisor, 80), true);
  }
  function debounce(fn,ms){
    let t=0;
    return function(){ clearTimeout(t); t=setTimeout(fn,ms); };
  }

  function init(){
    injectStyles();
    hookFunctions();
    observeInputs();
    renderAdvisor();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
