(function(root){
 root.buildCalibrationExcel=async function(ExcelJS,template,c){
 const w=new ExcelJS.Workbook();await w.xlsx.load(template);const sheets=[...w.worksheets],s=sheets.at(-1);for(const x of sheets)if(x!==s)w.removeWorksheet(x.id);s.name='Calibração';w.calcProperties.fullCalcOnLoad=true;w.views=[{activeTab:0,firstSheet:0}];s.conditionalFormattings=[];
 const set=(a,v)=>s.getCell(a).value=v===''?null:(v??null);
 const tolerance=CalibrationCore.parse(c.tolerance);
 if(!Number.isFinite(tolerance)||tolerance<0||c.readings.some(r=>CalibrationCore.reading(r).state==='invalid'))throw Error('Corrija os valores inválidos antes de exportar.');
 const values={C7:c.identification,F7:c.tag,I7:c.area,D8:c.order,I8:c.date?new Date(c.date+'T12:00:00Z'):null,D9:c.range,H9:c.manufacturer,C10:c.model,H10:tolerance/100,D54:c.executor,H54:c.technician,H36:c.certificate};Object.entries(values).forEach(([a,v])=>set(a,v));s.getCell('I8').numFmt='dd/mm/yyyy';s.getCell('H10').numFmt='0.00%';s.getRow(36).hidden=false;s.getRow(36).height=18;
 for(let r=48;r<=52;r++)set('A'+r,null);set('A48',c.notes);s.getCell('A48').alignment={wrapText:true,vertical:'top'};
 const coords=[['C16','D16','E16'],['G16','H16','I16'],['C25','D25','E25'],['G25','H25','I25'],['C30','D30','E30'],['G30','H30','I30'],['C35','D35','E35']];
 c.readings.forEach((r,i)=>{const [m,p,e]=coords[i],calc=CalibrationCore.reading(r);for(const [a,key] of [[m,'measured'],[p,'reference']]){const v=CalibrationCore.parse(r[key]);set(a,Number.isFinite(v)?v:null);s.getCell(a).numFmt='#,##0.000'}set(e,{formula:`IF(OR(${m}="",${p}="",${p}<=0,${m}<0),"",(${m}-${p})/${p})`,result:calc.state==='valid'?calc.error/100:''});s.getCell(e).numFmt='0.0000%'});
 const result=CalibrationCore.evaluate(c),errs=coords.slice(1).map(r=>r[2]);set('F33',{formula:`IF(COUNT(${errs.join(',')})=0,"",MAX(${errs.map(a=>'IF(ISNUMBER('+a+'),ABS('+a+'),0)').join(',')}))`,result:result.max===null?'':result.max/100});s.getCell('F33').numFmt='0.0000%';
 const invalid=coords.slice(1).flatMap(([m,p])=>[`AND(${m}<>"",${m}<0)`,`AND(${p}<>"",${p}<=0)`]).join(',');
 const incomplete=coords.slice(1).map(([m,p])=>`AND(COUNTA(${m},${p})>0,COUNT(${m},${p})<2)`).join(',');
 set('E38',{formula:`IF(OR(H10="",H10<0,${invalid}),"DADOS INVÁLIDOS",IF(OR(COUNT(${errs.join(',')})=0,${incomplete}),"PENDENTE",IF(F33<=H10,"CONFORME","NÃO CONFORME")))`,result:result.status});
 c.standards.slice(0,3).forEach((r,i)=>{['id','name','certificate','resolution','uncertainty','expiry'].forEach((k,j)=>set(['A','C','E','F','H','I'][j]+(43+i),r[k]))});
 s.pageSetup={...s.pageSetup,orientation:'portrait',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:1,printArea:'A1:I54'};
 const note=w.addWorksheet('Critério e fotos');note.columns=[{width:27},{width:70}];note.addRow(['Critério','Maior erro absoluto das leituras 1 a 6. Situação inicial separada.']);note.addRow(['Limite na exportação (%)',CalibrationCore.parse(c.tolerance)]);note.addRow(['Resultado na exportação',result.status]);note.addRow(['Observações',c.notes]);note.getRow(4).height=60;note.getCell('B4').alignment={wrapText:true,vertical:'top'};let row=6;
 for(let i=0;i<c.readings.length;i++)for(const p of c.readings[i].photos){note.getCell('A'+row).value=i===0?'Situação inicial':'Leitura '+i;const image=w.addImage({base64:p.src,extension:'jpeg'});note.addImage(image,{tl:{col:1,row:row-1},ext:{width:420,height:260}});row+=15}
 note.getRow(1).font={bold:true};return w;
 };
})(typeof window==='undefined'?globalThis:window);
