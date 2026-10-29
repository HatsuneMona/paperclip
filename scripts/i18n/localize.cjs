#!/usr/bin/env node
// Source-level i18n extraction and patching. Never rewrites rendered DOM or API data.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parse } = require('@babel/parser');
function localize({
 root = path.resolve(__dirname, '../../ui/src'),
 output = root,
 messages = path.join(root, 'i18n/messages'),
 translations = JSON.parse(fs.readFileSync(path.join(__dirname, 'translations.zh-CN.json'), 'utf8')),
 mode = 'extract',
 catalogPath,
} = {}) {
 if (!['extract', 'apply'].includes(mode)) throw new Error('Expected extract or apply');
const attributes = new Set(['title','label','description','placeholder','aria-label','alt','emptyMessage','emptyText','loadingText','loadingMessage','errorMessage','successMessage','confirmLabel','cancelLabel','submitLabel','buttonLabel','helperText','tooltip','tooltipText','heading','subtitle','subTitle','noResultsText','searchPlaceholder','hint','badgeLabel','textBadge','emptyLabel','aria-description']);
const properties = new Set(['label','title','description','placeholder','emptyMessage','emptyText','loadingText','errorMessage','successMessage','confirmLabel','cancelLabel','submitLabel','buttonLabel','helperText','tooltip','tooltipText','heading','subtitle','subTitle','noResultsText','searchPlaceholder','hint','badgeLabel','textBadge','emptyLabel','aria-description']);
const candidates = new Map();
const readMessages = (locale) => {
 const file = path.join(messages, locale + '.json');
 return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
};
const english = readMessages('en'), chinese = readMessages('zh-CN');
const en = english.messages || {}, zh = chinese.messages || {};
// Existing call sites are already translated, so refresh their catalog entries
// directly when maintainers edit the source dictionary.
if (mode === 'apply') {
 for (const [messageKey, text] of Object.entries(en)) {
  if (messageKey === key('time-unit:s')) zh[messageKey] = '秒';
  else if (Object.hasOwn(translations, text)) zh[messageKey] = translations[text];
 }
}
const identityLabels=new Set(), identityTitles=new Set();
let totalEdits = 0, changedFiles = 0;
function key(s) { return 'm_' + crypto.createHash('sha256').update(s).digest('hex').slice(0, 16); }
function walkFiles(dir) {
 return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walkFiles(path.join(dir,e.name)) : [path.join(dir,e.name)]);
}
function jsxText(raw) {
 const lines=raw.split(/\r\n|\n|\r/);let last=0;
 for(let i=0;i<lines.length;i++) if(/[^ \t]/.test(lines[i])) last=i;
 let result='';
 for(let i=0;i<lines.length;i++) {
  let s=lines[i].replace(/\t/g,' ');
  if(i!==0)s=s.replace(/^ +/,'');
  if(i!==lines.length-1)s=s.replace(/ +$/,'');
  if(s) {if(i!==last)s+=' ';result+=s;}
 }
 return result;
}
// Upstream sometimes uses display labels as protocol discriminators. Keep
// those model values canonical; translating a producer alone changes logic.
for(const file of walkFiles(root)) {
 if(!/\.tsx?$/.test(file)||/\.(test|spec)\./.test(file))continue;
 const source=fs.readFileSync(file,'utf8');
 for (const match of source.matchAll(/\b(label|title)\??:\s*((?:"[^"]+"|'[^']+')\s*(?:\|\s*(?:"[^"]+"|'[^']+')\s*)+)/g)) {
  for (const literal of match[2].matchAll(/["']([^"']+)["']/g)) (match[1] === 'label' ? identityLabels : identityTitles).add(literal[1]);
 }
 for(const match of source.matchAll(/\.\s*(label|title)\s*(?:===|!==|==|!=)\s*["']([^"']+)["']/g)) {
  (match[1]==='label'?identityLabels:identityTitles).add(match[2]);
 }
}
// Keep every label/title used as a discriminator canonical, including breadcrumbs.
for (const file of walkFiles(root)) {
 const rel = path.relative(root,file);
 if (rel === 'components/StatusBadge.tsx' || !/\.tsx?$/.test(file) || /\.(test|spec|fixtures)\.|(?:UxLab|Perf|DesignGuide|TaskChatLab)/.test(rel) || /^(?:i18n|api|__)/.test(rel)) continue;
 const source=fs.readFileSync(file,'utf8');
 const protocolModel=/^(?:lib\/|components\/(?:task-chat|transcript)\/)/.test(rel)||/(?:IssueChatThread|TaskChatThread|RunnerInspector)/.test(rel);
 let ast;
 try { ast=parse(source,{sourceType:'module',plugins:['typescript',...(file.endsWith('.tsx')?['jsx']:[])]}); }
 catch(e) {throw new Error(`${rel}: ${e.message}`);}
 const edits=new Map();
 function add(node, text, args=[], jsx=false, reason='') {
  if(!/[A-Za-z]/.test(text) || text.length>2000 || /^\s*(?:https?:\/\/|\/[\w/.:-]+$)/.test(text))return;
  if ((reason === 'property-label' || reason === 'variable-label' || reason === 'attribute-label') && (protocolModel || identityLabels.has(text))) return;
  if ((reason === 'property-title' || reason === 'attribute-title') && identityTitles.has(text)) return;
  if(!candidates.has(text))candidates.set(text,{text,key:key(text),occurrences:[]});
  candidates.get(text).occurrences.push({file:rel,line:node.loc.start.line,reason});
  if(mode!=='apply'||!Object.hasOwn(translations,text))return;
  const secondsUnit=text==='s'&&reason==='jsx';
  const k=key(secondsUnit?'time-unit:s':text);en[k]=text;zh[k]=secondsUnit?'秒':translations[text];
  const call=`uiT("ui:messages.${k}"${args.length?`, { ${args.map((expr,i)=>`v${i}: (${expr})`).join(', ')} }`:''})`;
  edits.set(`${node.start}:${node.end}`,{start:node.start,end:node.end,text:jsx?`{${call}}`:call});
 }
 function display(node,jsx=false,reason='expression') {
  if(!node)return;
  if(node.type==='StringLiteral')add(node,node.value,[],jsx,reason);
  else if(node.type==='TemplateLiteral') {
   const fullText=node.quasis.map((q,i)=>(q.value.cooked??q.value.raw)+(i<node.expressions.length?`{{v${i}}}`:'')).join('');
   let text='';const args=[];
   node.quasis.forEach((q,i)=>{text+=q.value.cooked??q.value.raw;if(i<node.expressions.length){
    text+=`{{v${i}}}`;
    const expression=node.expressions[i];
    // Translate literal grammatical branches, never dynamic user data.
    if(expression.type==='ConditionalExpression'&&(mode!=='apply'||Object.hasOwn(translations,fullText)))display(expression,false,'template-branch');
    let argument=source.slice(expression.start,expression.end);
    for(const edit of [...edits.values()].filter(e=>e.start>=expression.start&&e.end<=expression.end).sort((a,b)=>b.start-a.start)) {
     argument=argument.slice(0,edit.start-expression.start)+edit.text+argument.slice(edit.end-expression.start);
    }
    args.push(argument);
   }});
   add(node,text,args,jsx,reason);
  } else if(node.type==='ConditionalExpression') {display(node.consequent,false,reason);display(node.alternate,false,reason);}
  else if(node.type==='LogicalExpression')display(node.right,false,reason);
  else if(node.type==='TSAsExpression'||node.type==='TSSatisfiesExpression'||node.type==='ParenthesizedExpression')display(node.expression,jsx,reason);
 }
 function visit(node,parent) {
  if(!node||typeof node!=='object'||!node.type)return;
  if(node.type==='CallExpression' && /^(?:uiT|t|localeT|i18n\.t)$/.test(source.slice(node.callee.start,node.callee.end)))return;
  if(node.type==='JSXElement'&&['code','pre','kbd'].includes(node.openingElement?.name?.name))return;
  if(node.type==='JSXText')add(node,jsxText(node.value),[],true,'jsx');
  if(node.type==='JSXAttribute'&&attributes.has(node.name.name)) {
   if(node.value?.type==='StringLiteral')display(node.value,true,'attribute-'+node.name.name);
   else if(node.value?.type==='JSXExpressionContainer')display(node.value.expression,false,'attribute-'+node.name.name);
  }
  if(node.type==='JSXExpressionContainer'&&parent?.type!=='JSXAttribute')display(node.expression,false,'child');
  if(node.type==='ObjectProperty'&&!node.computed) {
   const name=node.key.name??node.key.value;
   if(properties.has(name))display(node.value,false,'property-'+name);
  }
  if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&properties.has(node.id.name))display(node.init,false,'variable-'+node.id.name);
  if(node.type==='CallExpression') {
   const callee=source.slice(node.callee.start,node.callee.end);
   if(/^(?:window\.)?(?:confirm|alert)$/.test(callee)||/^set\w*(?:Error|ErrorMessage|SuccessMessage)$/.test(callee)||/^toast\.(?:success|error|info|warning|message)$/.test(callee))display(node.arguments[0],false,'notification');
  }
  // Babel nodes only; never traverse comments or location metadata.
  for(const [k,v] of Object.entries(node)) {
   if(['loc','comments','leadingComments','trailingComments','innerComments','tokens','errors'].includes(k))continue;
   if(Array.isArray(v))for(const child of v)visit(child,node);
   else if(v&&typeof v==='object')visit(v,node);
  }
 }
 visit(ast,null);
 if(mode==='apply'&&edits.size) {
  let result=source;
  let last=source.length;
  const outerEdits = [...edits.values()].filter(edit => ![...edits.values()].some(other => other !== edit && other.start <= edit.start && other.end >= edit.end));
  for(const edit of outerEdits.sort((a,b)=>b.start-a.start)) {
   if(edit.end>last)continue; // Outer template/branch already owns its expressions.
   result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);last=edit.start;totalEdits++;
  }
  if (!/import\s*{[^}]*\bt\s+as\s+uiT\b[^}]*}\s*from\s*["']@\/i18n["']/.test(result)) {
   const insertion = ast.program.directives.at(-1)?.end ?? ast.program.interpreter?.end ?? 0;
   const declaration = 'import { t as uiT } from "@/i18n";\n';
   result = insertion ? result.slice(0, insertion) + '\n' + declaration + result.slice(insertion) : declaration + result;
  }
  parse(result,{sourceType:'module',plugins:['typescript',...(file.endsWith('.tsx')?['jsx']:[])]});
  const dest=path.join(output,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,result);changedFiles++;
 }
}
const catalog=[...candidates.values()].sort((a,b)=>a.text.localeCompare(b.text));
if (catalogPath) fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
if(mode==='apply') {
 fs.mkdirSync(messages,{recursive:true});
 for(const [locale, resource, entries] of [['en', english, en],['zh-CN', chinese, zh]]) {
  resource.messages = entries;
  fs.writeFileSync(path.join(messages,locale+'.json'),JSON.stringify(resource,null,2)+'\n');
 }
}
return { candidates:catalog.length, translated:catalog.filter(c=>Object.hasOwn(translations,c.text)).length, changedFiles,totalEdits };
}
module.exports = { localize };
if (require.main === module) {
 const catalogIndex = process.argv.indexOf('--catalog');
 if (catalogIndex !== -1 && !process.argv[catalogIndex + 1]) throw new Error('--catalog requires an output path');
 console.log(JSON.stringify(localize({ mode: process.argv[2] || 'extract', catalogPath: catalogIndex === -1 ? undefined : process.argv[catalogIndex + 1] })));
}
