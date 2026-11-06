const $=id=>document.getElementById(id);
let level='beginner',usedModel='';
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---------- Role and level prompts (sent to the AI model) ----------
const ROLES={
  teacher:'You are a patient programming teacher.',
  reviewer:'You are a senior code reviewer who is precise and direct.',
  mentor:'You are a friendly mentor who encourages the learner.'
};
const LEVELS={
  beginner:'Explain for a complete beginner. Use simple words, avoid jargon, and use everyday analogies.',
  intermediate:'Explain for someone who knows the basics. Cover how and why each line works.',
  expert:'Explain for an experienced engineer. Mention time and space complexity, edge cases and trade-offs.'
};
function buildPrompt(code,lang){
  return {
    system:`${ROLES[$('role').value]} ${LEVELS[level]} Respond ONLY with a JSON array. Each item: {"line": <number>, "code": "<the line>", "explanation": "<text>"}. Skip empty lines. Language: ${lang}.`,
    user:code
  };
}

// ---------- Offline explainer (fallback) ----------
function detect(code){
  if(/^\s*</m.test(code)&&/<\/?\w+/.test(code))return'HTML';
  if(/\{[^}]*:[^}]*;/s.test(code)||/^\s*@import/m.test(code))return'CSS';
  if(/\bdef\s|\bimport\s+\w+$|print\(/m.test(code)&&!/[;{]\s*$/m.test(code))return'Python';
  if(/\b(const|let|=>|console\.log|function)\b/.test(code))return'JavaScript';
  if(/#include|printf|cout/.test(code))return'C / C++';
  if(/public\s+(static\s+)?(class|void)|System\.out/.test(code))return'Java';
  return'Python';
}
const TAGS={html:'the root of the page, everything lives inside it',head:'holds page settings such as the title, fonts and CSS links (not shown on the page)',body:'holds everything the visitor actually sees',title:'sets the title shown on the browser tab',meta:'gives the browser extra info such as character set or screen scaling',link:'connects an external file such as a stylesheet',div:'a generic box used to group and lay out content',span:'a small inline wrapper for part of a text',p:'a paragraph of text',h1:'the main heading',h2:'a section heading',h3:'a sub-heading',a:'a link to another page',img:'shows an image',ul:'a bulleted list',ol:'a numbered list',li:'one item in a list',button:'a clickable button',input:'a field where the user types or chooses something',form:'a form that collects user input',script:'loads or holds JavaScript',style:'holds CSS written inside the page',table:'a table of rows and columns',header:'the top section of a page',footer:'the bottom section of a page',nav:'a group of navigation links',section:'a themed section of a page',textarea:'a multi-line text box',label:'a caption for a form field',select:'a dropdown menu'};
const RULES=[
 [/^\s*(def|function)\s+(\w+)\s*\(([^)]*)\)/,(m,l)=>({b:`Defines a function named "${m[2]}" that takes ${m[3].trim()?'the inputs: '+m[3].trim():'no inputs'}.`,i:`Declares "${m[2]}" with ${m[3].trim()||'no'} parameter(s); the indented body below runs each time it is called.`,e:`Function "${m[2]}" creates a new scope each call; check parameter defaults and mutability.`})],
 [/^\s*(if|else if|elif)\b(.*)/,(m)=>({b:`Checks a condition${m[2].trim()?' ('+m[2].replace(/[:{]\s*$/,'').trim()+')':''}. The code under it runs only if the answer is yes.`,i:`Conditional branch on ${m[2].replace(/[:{]\s*$/,'').trim()||'a condition'}; the block runs only when it evaluates to true.`,e:`Branch on ${m[2].replace(/[:{]\s*$/,'').trim()}. Consider boundary values and whether branches are exhaustive.`})],
 [/^\s*else\b/,()=>({b:'Runs when the earlier "if" checks were all false.',i:'Fallback branch when no previous condition matched.',e:'Default path; confirm it handles every input the earlier branches skip.'})],
 [/^\s*for\b(.*)/,m=>({b:'Starts a loop that repeats the indented code several times.',i:`Loop header (${m[1].replace(/[:{]\s*$/,'').trim()}) that iterates over a sequence or range.`,e:`Iteration over ${m[1].replace(/[:{]\s*$/,'').trim()}; total cost is O(n) times the body cost.`})],
 [/^\s*while\b(.*)/,m=>({b:'Keeps repeating the code below as long as the condition stays true.',i:`Loop runs while ${m[1].replace(/[:{]\s*$/,'').trim()} is true.`,e:`Loop on ${m[1].replace(/[:{]\s*$/,'').trim()}. Ensure the condition changes, or it never terminates.`})],
 [/^\s*return\b(.*)/,m=>({b:`Sends ${m[1].trim()?'"'+m[1].trim()+'"':'nothing'} back to whoever called the function and stops it.`,i:`Returns ${m[1].trim()||'nothing'} to the caller and exits the function.`,e:`Return of ${m[1].trim()||'None'}; if this is recursive, the call stack grows with each level.`})],
 [/^\s*(print|console\.log|System\.out\.println|printf|cout)\b(.*)/,m=>({b:'Shows something on the screen.',i:`Outputs ${m[2].trim()||'a value'} to the console.`,e:'I/O side effect; avoid it in hot paths or pure functions.'})],
 [/^\s*(import|from|#include|using)\b(.*)/,m=>({b:'Brings in extra tools that someone else wrote so we can use them.',i:`Imports ${m[2].trim()} so its functions are available here.`,e:`Dependency on ${m[2].trim()}; watch for import cost and name clashes.`})],
 [/^\s*(class)\s+(\w+)/,m=>({b:`Creates a blueprint called "${m[2]}" for making objects.`,i:`Defines class "${m[2]}" that groups data and methods.`,e:`Class "${m[2]}": consider encapsulation, inheritance and memory layout.`})],
 [/^\s*(const|let|var|int|float|double|String|char|auto)?\s*([A-Za-z_]\w*)\s*=\s*(.+)/,m=>({b:`Stores the value ${m[3].trim()} in a box named "${m[2]}".`,i:`Assigns ${m[3].trim()} to the variable "${m[2]}".`,e:`Binding of "${m[2]}" to ${m[3].trim()}; check type, scope and mutability.`})],
 [/^\s*@import\b(.*)/,()=>({b:'Loads a font or another style file from the internet.',i:'CSS @import: pulls in an external stylesheet or web font.',e:'@import blocks rendering until it loads; prefer a <link> tag for performance.'})],
 [/^\s*<!DOCTYPE/i,()=>({b:'Tells the browser this page is written in modern HTML5.',i:'Document type declaration: switches the browser to standards mode.',e:'DOCTYPE prevents quirks mode and keeps layout consistent across browsers.'})],
 [/^\s*<\/?([A-Za-z][\w-]*)[^>]*>?/,m=>{const t=m[1].toLowerCase(),cl=m.input.match(/class="([^"]+)"/),closing=/^\s*<\//.test(m.input),d=TAGS[t]||'an element that structures the page',c=cl?' with class "'+cl[1]+'"':'';
   if(closing)return{b:'Closes the <'+t+'> tag opened earlier.',i:'Closing tag for <'+t+'>.',e:'</'+t+'> ends the element; verify nesting is balanced.'};
   return{b:'<'+t+'>'+c+': '+d+'.',i:'HTML <'+t+'>'+c+': '+d+'.',e:'<'+t+'>'+c+': '+d+'. Check semantics and accessibility.'};}],
 [/^\s*([.#]?[\w][\w\s.#>:,\[\]=*-]*)\{\s*$/,m=>({b:`Starts a style rule for "${m[1].trim()}". The lines below say how it should look.`,i:`CSS selector "${m[1].trim()}" opens a block of declarations.`,e:`Selector "${m[1].trim()}": consider specificity and how it cascades with other rules.`})],
 [/^\s*([a-z-]+)\s*:\s*([^;]+);\s*$/,m=>({b:`Sets the style "${m[1]}" to ${m[2].trim()}.`,i:`CSS declaration: property "${m[1]}" gets the value ${m[2].trim()}.`,e:`Declares ${m[1]}: ${m[2].trim()}; check inheritance and browser support.`})],
 [/^\s*(\/\/|#)(.*)/,m=>({b:'A comment. It is a note for humans and the computer ignores it.',i:'Comment line; not executed.',e:'Comment: make sure it explains why, not what.'})],
 [/^\s*[}\])]\s*;?\s*$/,()=>({b:'Marks the end of a block of code.',i:'Closes the current block.',e:'Scope ends here; locals declared inside are released.'})]
];
function offline(code){
  return code.split('\n').map((t,i)=>({line:i+1,code:t})).filter(x=>x.code.trim()).map(x=>{
    for(const [re,fn] of RULES){const m=x.code.match(re);if(m){const r=fn(m);
      x.explanation=level==='beginner'?r.b:level==='intermediate'?r.i:r.e;return x;}}
    x.explanation=level==='beginner'?'A step in the program that does some work.':level==='intermediate'?'A statement that runs in order with the lines around it.':'Statement executed sequentially; check for side effects.';
    return x;});
}

// ---------- AI call ----------
async function viaAI(code,lang){
  const p=buildPrompt(code,lang);
  const chosen=$('model').value.trim();
  const models=[...new Set([chosen,'gemini-flash-latest','gemini-2.0-flash','gemini-2.5-flash-lite'].filter(Boolean))];
  let lastErr='';
  for(const model of models){
    const url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent($('key').value.trim());
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        systemInstruction:{parts:[{text:p.system}]},
        contents:[{role:'user',parts:[{text:p.user}]}],
        generationConfig:{temperature:+$('temp').value,maxOutputTokens:+$('maxt').value,responseMimeType:'application/json'}
      })});
    if([404,429,500,503].includes(r.status)){
      if(r.status!==404){await new Promise(z=>setTimeout(z,1200));}
      lastErr='API error '+r.status+' on '+model;continue;}
    if(!r.ok)throw new Error('API error '+r.status);
    const d=await r.json();
    const txt=d.candidates[0].content.parts[0].text.replace(/```json|```/g,'').trim();
    usedModel=model;
    return JSON.parse(txt);
  }
  throw new Error(lastErr||'no model available');
}

function render(items){
  $('out').innerHTML=items.map(x=>`<div class="ln"><div class="n">${x.line}</div><code>${esc(String(x.code))}</code><p>${esc(String(x.explanation))}</p></div>`).join('');
}

// ---------- History ----------
const KEY='ace_history';
const getH=()=>{try{return JSON.parse(localStorage.getItem(KEY))||[]}catch(e){return[]}};
const setH=h=>{try{localStorage.setItem(KEY,JSON.stringify(h))}catch(e){}};
function drawH(){
  const h=getH();
  $('hist').innerHTML=h.length?h.map((x,i)=>`<div class="h"><div><span class="tag">${x.level}</span><code>${esc(x.code.split('\n')[0].slice(0,50))}</code></div><div><button class="btn alt sm" data-open="${i}">Open</button><button class="btn alt sm" data-del="${i}">Delete</button></div></div>`).join(''):'<div class="empty"><svg viewBox="0 0 90 70" aria-hidden="true"><circle cx="45" cy="35" r="26" fill="#eef0f7"/><path d="M45 20v16l10 6" stroke="#14213d" stroke-width="3" fill="none" stroke-linecap="round"/></svg><span>No history yet. Explain some code and it will show up here.</span></div>';
}
$('hist').addEventListener('click',e=>{
  const h=getH();
  if(e.target.dataset.open!==undefined){const x=h[e.target.dataset.open];$('code').value=x.code;setLevel(x.level);render(x.items);$('tool').scrollIntoView({behavior:'smooth'});}
  if(e.target.dataset.del!==undefined){h.splice(e.target.dataset.del,1);setH(h);drawH();}
});
$('clearHist').onclick=()=>{setH([]);drawH();};

// ---------- UI ----------
function setLevel(l){level=l;document.querySelectorAll('.lvl').forEach(b=>b.setAttribute('aria-pressed',b.dataset.level===l));}
document.querySelectorAll('.lvl').forEach(b=>b.onclick=()=>setLevel(b.dataset.level));
$('temp').oninput=e=>$('tv').textContent=e.target.value;
$('clear').onclick=()=>{$('code').value='';$('status').textContent='';};
$('go').onclick=async()=>{
  const code=$('code').value;
  if(!code.trim()){$('status').textContent='Paste some code first.';return;}
  const lang=$('lang').value==='auto'?detect(code):$('lang').value;
  $('status').textContent='Explaining...';$('go').disabled=true;
  let items;
  try{
    if($('key').value.trim()){items=await viaAI(code,lang);$('status').textContent='Explained by AI model ('+usedModel+').';}
    else{items=offline(code);$('status').textContent='Explained offline. Add an API key in AI settings for full AI output.';}
  }catch(err){
    items=offline(code);$('status').textContent='AI request failed ('+err.message+'). Showing offline explanation.';
  }
  render(items);
  const h=getH();h.unshift({code,level,items,t:Date.now()});setH(h.slice(0,15));drawH();
  $('go').disabled=false;
};
drawH();
