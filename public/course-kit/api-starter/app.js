const cities={philadelphia:{name:"Philadelphia",latitude:39.95,longitude:-75.16},lahore:{name:"Lahore",latitude:31.52,longitude:74.36},abudhabi:{name:"Abu Dhabi",latitude:24.45,longitude:54.38}};
const $=id=>document.getElementById(id),form=$("query");let requestNumber=0;
// Deliberately fictional examples: useful for testing, never presented as live.
const fixtures={weather:{timezone:"America/New_York",current:{temperature_2m:18,time:"2026-11-02T12:00"},current_units:{temperature_2m:"°C"}},air:{timezone:"America/New_York",current:{pm2_5:12,time:"2026-11-02T12:00"},current_units:{pm2_5:"μg/m³"}}};
const urls=city=>({weather:`https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m&timezone=auto`,air:`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${city.latitude}&longitude=${city.longitude}&current=pm2_5&timezone=auto`});
function show(target,data,field,label,synthetic){
  target.replaceChildren();const value=data.current?.[field],unit=data.current_units?.[field];if(typeof value!=="number"||typeof unit!=="string")throw new Error("The expected value or unit is missing. Inspect the response.");
  const source=document.createElement("p");source.className="source";source.textContent=synthetic?"SYNTHETIC TEACHING DATA · not live":"Live API response · modeled conditions";
  const reading=document.createElement("p");reading.className="value";reading.textContent=`${value} ${unit}`;
  const time=document.createElement("p");time.textContent=`${label}. Model timestep: ${data.current.time||"not supplied"}; timezone: ${data.timezone||"not supplied"}.`;
  target.append(source,reading,time);
}
form.addEventListener("submit",async event=>{
  event.preventDefault();const number=++requestNumber,button=form.querySelector("button"),city=cities[form.elements.city.value],synthetic=form.elements.mode.value==="fixture",endpoints=urls(city);
  button.disabled=true;$("status").textContent=synthetic?"Loading fictional fixtures. No provider request will be sent.":`Requesting two small results for ${city.name}…`;
  $("alignment").textContent="";for(const id of ["weather","air"])$(id).textContent="Loading…";
  const log=[];
  const results=await Promise.allSettled(["weather","air"].map(async id=>{
    const field=id==="weather"?"temperature_2m":"pm2_5";
    if(form.elements[id==="weather"?"failWeather":"failAir"].checked){log.push(`${id}: deliberately unavailable; no request sent`);throw new Error("This service is deliberately unavailable for the exercise.");}
    if(synthetic){log.push(`${id}: fictional ${field} fixture`);return {id,data:fixtures[id]};}
    const response=await fetch(endpoints[id],{signal:AbortSignal.timeout(10000)});log.push(`${id}: HTTP ${response.status}\n${endpoints[id]}\nDisplay field: current.${field}`);
    if(!response.ok)throw new Error(`Provider returned HTTP ${response.status}.`);return {id,data:await response.json()};
  }));
  if(number!==requestNumber)return;
  let succeeded=0;
  results.forEach((result,index)=>{const id=index===0?"weather":"air";try{if(result.status==="rejected")throw result.reason;show($(id),result.value.data,id==="weather"?"temperature_2m":"pm2_5",id==="weather"?"Temperature":"Fine particulate matter",synthetic);succeeded++;}catch(error){$(id).replaceChildren();const message=document.createElement("p");message.className="error";message.textContent=error.message||"The request failed. Try the explicitly labeled teaching-data mode.";$(id).append(message);}});
  $("status").textContent=`${synthetic?"Synthetic exercise":"Live request"}: ${succeeded} of 2 datasets displayed. ${succeeded<2?"The unavailable service has not been silently replaced with sample data.":"Check source, units, time, and meaning before comparing."}`;
  const times=results.filter(row=>row.status==="fulfilled").map(row=>row.value.data.current?.time);if(times.length===2&&times[0]!==times[1])$("alignment").textContent="The services report different model timesteps. Do not imply these values describe exactly the same instant.";
  $("requests").textContent=log.join("\n\n");button.disabled=false;
});
