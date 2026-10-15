/* Relatório A4 com paginação, fotos proporcionais e cabeçalho em todas as páginas. */
$('pdf').onclick=async()=>{
 if(!ready())return;
 const button=$('pdf');button.disabled=true;button.textContent='Preparando relatório…';
 try{
 const {PDFDocument,StandardFonts,rgb}=PDFLib,doc=await PDFDocument.create();
 const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const W=595.28,H=841.89,M=42,CW=W-2*M;
 const ink=rgb(.10,.19,.22),green=rgb(.07,.34,.29),muted=rgb(.36,.43,.44),light=rgb(.94,.96,.95),line=rgb(.82,.87,.85),white=rgb(1,1,1);
 const m=data().meta;let page,y;
 function clean(v){return String(v??'').replace(/[–—]/g,'-').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").split('').map(c=>{try{regular.encodeText(c);return c}catch{return '?'}}).join('')}
 function wrap(value,size,width,font=regular){let lines=[];for(const para of clean(value).split('\n')){let current='';for(const word of para.split(/\s+/)){if(!word)continue;const candidate=current?current+' '+word:word;if(font.widthOfTextAtSize(candidate,size)<=width){current=candidate;continue}if(current){lines.push(current);current=''}for(const c of word){if(font.widthOfTextAtSize(current+c,size)>width){lines.push(current);current=''}current+=c}}lines.push(current)}return lines}
 function draw(text,x,yy,size=10,font=regular,color=ink){page.drawText(clean(text),{x,y:yy,size,font,color})}
 function newPage(){page=doc.addPage([W,H]);page.drawRectangle({x:0,y:H-67,width:W,height:67,color:green});draw('VISTORIA TÉCNICA',M,H-31,14,bold,white);draw('INSTRUMENTAÇÃO E AUTOMAÇÃO',M,H-48,8,regular,white);y=H-91}
 function need(h){if(y-h<55)newPage()}
 function paragraph(v,size=10,color=ink){for(const t of wrap(v,size,CW)){need(size+5);draw(t,M,y,size,regular,color);y-=size+5}y-=5}
 function heading(v){need(33);y-=7;draw(v,M,y,12,bold,green);y-=10;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:.8,color:line});y-=18}
 function detail(label,value){if(!value)return;need(39);draw(label.toUpperCase(),M,y,8,bold,muted);y-=16;paragraph(value)}
 function grid(items){const gap=10,width=(CW-gap)/2;for(let k=0;k<items.length;k+=2){const cells=items.slice(k,k+2).map(([label,value])=>({label,lines:wrap(value||'Não informado',10,width-20)}));const maxLines=Math.max(...cells.map(c=>c.lines.length));for(let off=0;off<maxLines;off+=30){const n=Math.min(30,maxLines-off),h=34+n*14;need(h+10);cells.forEach((c,i)=>{const x=M+i*(width+gap);page.drawRectangle({x,y:y-h,width,height:h,color:light});draw(c.label.toUpperCase()+(off?' (CONT.)':''),x+10,y-15,7,bold,muted);c.lines.slice(off,off+n).forEach((t,j)=>draw(t,x+10,y-32-j*14,10))});y-=h+9}}}
 newPage();for(const t of wrap(m.title||'Relatório de levantamento técnico',19,CW,bold)){need(27);draw(t,M,y,19,bold);y-=25}y-=12;
 grid([['Data da vistoria',datefmt(m.date)],['Referência',m.number||'Não informada'],['Responsável pelo levantamento',m.author],['Empresa / unidade',m.company],['Setor',m.sector],['Pontos inspecionados',String(records.length)]]);
 detail('Objetivo do levantamento',m.objective);
 const pending=records.filter(r=>r.status==='Pendente'||r.status==='Em acompanhamento').length;
 paragraph(records.length+' ponto(s) registrado(s)  |  '+pending+' em acompanhamento ou pendente(s)',9,muted);
 for(let i=0;i<records.length;i++){
 const r=records[i];need(165);heading(String(i+1).padStart(2,'0')+' / PONTO INSPECIONADO');
 for(const t of wrap(r.tag+' | '+r.area,14,CW,bold)){need(21);draw(t,M,y,14,bold);y-=20}y-=5;
 const pc={Crítica:rgb(.67,.15,.15),Alta:rgb(.72,.30,.08),'Média':rgb(.47,.35,.08),Baixa:green}[r.priority]||muted;
 need(28);draw('PRIORIDADE: '+r.priority.toUpperCase(),M,y,9,bold,pc);y-=22;
 grid([['Equipamento',r.equipment],['Condição',r.condition],['Situação',r.status],['Prazo previsto',r.deadline?datefmt(r.deadline):'A definir']]);
 detail('Condição encontrada',r.problem);detail('Impacto / consequência',r.impact);detail('Ação recomendada',r.action);detail('Responsável pela ação',r.owner);
 if(r.photos.length){need(425);heading('REGISTRO FOTOGRÁFICO');for(let j=0;j<r.photos.length;j++){
 const p=r.photos[j],img=await doc.embedJpg(p.src),scale=Math.min((CW-20)/img.width,330/img.height),w=img.width*scale,h=img.height*scale;
 need(h+53);page.drawRectangle({x:M,y:y-h-10,width:CW,height:h+10,color:light});page.drawImage(img,{x:(W-w)/2,y:y-h-5,width:w,height:h});y-=h+27;
 paragraph('Foto '+(i+1)+'.'+(j+1)+(p.caption?' - '+p.caption:''),9,muted);y-=7;
 }}
 }
 if(m.conclusion){heading('CONCLUSÃO / OBSERVAÇÕES FINAIS');paragraph(m.conclusion)}
 const pages=doc.getPages();pages.forEach((p,i)=>{p.drawLine({start:{x:M,y:39},end:{x:W-M,y:39},thickness:.5,color:line});p.drawText('Relatório de vistoria | '+datefmt(m.date),{x:M,y:25,size:8,font:regular,color:muted});const s=(i+1)+' / '+pages.length;p.drawText(s,{x:W-M-regular.widthOfTextAtSize(s,8),y:25,size:8,font:regular,color:muted})});
 doc.setTitle(clean(m.title||'Relatório de vistoria técnica'));doc.setAuthor(clean(m.author));
 download(new Blob([await doc.save()],{type:'application/pdf'}),'Relatorio-vistoria-'+m.date+'.pdf');notify('PDF gerado. Confira os downloads.');
 }catch(e){notify('Não foi possível gerar o PDF: '+e.message)}finally{button.disabled=false;button.textContent='Baixar PDF'}
};
