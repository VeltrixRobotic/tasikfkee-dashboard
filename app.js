const API="https://api.veltrixrobotic.com";
let envChart,waterLevelChart,solarChart;

const $=id=>document.getElementById(id);

const num=(v,d=2)=>
  Number.isFinite(Number(v))?Number(v).toFixed(d):"--";

const time=v=>{
  const d=new Date(v);
  return v&&!isNaN(d)
    ?d.toLocaleString("en-MY",{dateStyle:"medium",timeStyle:"medium"})
    :"--";
};

const range=$("range");
range.value="1";

async function get(url){
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok)throw Error(r.status);
  return r.json();
}

function setStatus(s){
  const state=String(s||"OFFLINE").trim().toUpperCase();
  const box=$("statusText").closest(".top-status");

  let cls="offline";
  let label="OFFLINE";

  if(state==="ONLINE"){
    cls="online";
    label="ONLINE";
  }else if(state==="SLEEP" || state==="SLEEPING"){
    cls="sleep";
    label="SLEEP";
  }else if(state==="MAINTENANCE"){
    cls="maintenance";
    label="MAINTENANCE";
  }

  box.className="top-status "+cls;
  $("statusText").textContent=label;
}

/*
 * Device status rules:
 * - More than 10 minutes since the latest received data/status = OFFLINE.
 * - If the server reports SLEEP/SLEEPING and the last update is fresh = SLEEP.
 * - Otherwise use the server-reported status.
 */
function resolveDeviceStatus(serverStatus,lastSeen,ageSeconds){
  const state=String(serverStatus||"").trim().toUpperCase();
  const timestamp=lastSeen ? new Date(lastSeen).getTime() : NaN;
  const reportedAge=Number(ageSeconds);

  // Prefer the server's age_seconds when supplied; otherwise calculate from
  // last_seen/received_at. More than 10 minutes without an update is OFFLINE.
  let ageMs=Number.isFinite(reportedAge)&&reportedAge>=0
    ?reportedAge*1000
    :Number.isFinite(timestamp)
      ?Date.now()-timestamp
      :NaN;

  if(!Number.isFinite(ageMs)||ageMs<0||ageMs>10*60*1000){
    return "OFFLINE";
  }

  if(state==="SLEEP" || state==="SLEEPING") return "SLEEP";
  if(state==="ONLINE") return "ONLINE";
  if(state==="MAINTENANCE") return "MAINTENANCE";

  return "OFFLINE";
}

function setWaterLevelStatus(value){
  const badge=$("waterStatus");
  const card=$("water").closest(".metric-card");
  const level=Number(value);

  if(!Number.isFinite(level)){
    badge.textContent="--";
    badge.className="water-status neutral";
    card.classList.remove("water-normal","water-warning","water-alert");
    return;
  }

  let state="NORMAL";
  let cls="water-normal";

  if(level>100){
    state="ALERT";
    cls="water-alert";
  }else if(level>=80){
    state="WARNING";
    cls="water-warning";
  }

  badge.textContent=state;
  badge.className="water-status "+cls;
  card.classList.remove("water-normal","water-warning","water-alert");
  card.classList.add(cls);
}


// The server-side history API is the shared source of truth for all visitors.
// localStorage is only a per-browser fallback; it is NOT shared between users.
const SENSOR_FIELDS = [
  "temperature","humidity","pressure","water_distance_cm",
  "water_pulse_us","solar_voltage","solar_current_ma","solar_power_mw"
];
let lastSensorData = {};
let historySeeded = false;

function hasSensorReading(data){
  return SENSOR_FIELDS.some(key =>
    data && data[key] !== null && data[key] !== undefined &&
    data[key] !== "" && Number.isFinite(Number(data[key]))
  );
}

function mergeSensorReadings(data){
  if(!data || typeof data !== "object") return;
  for(const key of SENSOR_FIELDS){
    const value=data[key];
    if(value !== null && value !== undefined && value !== "" &&
       Number.isFinite(Number(value))){
      lastSensorData[key]=Number(value);
    }
  }
  if(hasSensorReading(lastSensorData)){
    try{ localStorage.setItem("tasikfkee-last-sensor-data",JSON.stringify(lastSensorData)); }catch(e){}
  }
}

function loadCachedSensorReadings(){
  try{
    const saved=JSON.parse(localStorage.getItem("tasikfkee-last-sensor-data")||"{}");
    if(saved && typeof saved==="object") mergeSensorReadings(saved);
  }catch(e){}
}

function historyTimestamp(row){
  const raw=row?.time ?? row?.timestamp ?? row?.received_at ??
    row?.created_at ?? row?.datetime ?? row?.date;
  if(raw===undefined || raw===null || raw==="") return NaN;
  if(typeof raw==="number" || /^\d+(\.\d+)?$/.test(String(raw))){
    const n=Number(raw);
    return n < 1e12 ? n*1000 : n;
  }
  return new Date(raw).getTime();
}

function normalizeHistoryRows(payload){
  const rows=Array.isArray(payload) ? payload :
    Array.isArray(payload?.data) ? payload.data : [];
  return rows
    .map(row=>({...row,_time:historyTimestamp(row)}))
    .filter(row=>Number.isFinite(row._time))
    .sort((a,b)=>a._time-b._time);
}

async function seedSensorReadingsFromHistory(force=false){
  if(historySeeded && !force) return;
  historySeeded=true;
  try{
    const x=await get(`${API}/api/tasikfkee/history?hours=24`);
    const rows=normalizeHistoryRows(x);
    // Walk backwards to find the newest record containing at least one valid
    // sensor reading. This comes from the server, so every visitor can restore it.
    for(let i=rows.length-1;i>=0;i--){
      if(hasSensorReading(rows[i])){
        mergeSensorReadings(rows[i]);
        break;
      }
    }
  }catch(e){
    console.warn("Could not restore shared last sensor readings from history API:",e);
    // Per-browser cache remains a fallback only if the server history is unavailable.
  }
}

async function latest(){
  try{
    const x=await get(API+"/api/tasikfkee/latest");
    const d=x.data||{};

    // The latest endpoint may contain only data.status during deep sleep.
    // In that case, retain the last sensor readings instead of replacing them
    // with "--". Restore from history if this is a fresh browser session.
    mergeSensorReadings(d);
    if(!historySeeded){
      await seedSensorReadingsFromHistory();
    }
    const readings=lastSensorData;

    // The device-published status is inside data.status. The top-level status
    // may be the server's automatic availability status.
    const lastSeen=x.last_seen||x.received_at||x.data?.received_at||x.data?.timestamp;
    const reportedStatus=x.data?.status||x.status;
    setStatus(resolveDeviceStatus(reportedStatus,lastSeen,x.age_seconds));

    $("updated").textContent=time(lastSeen);
    $("temperature").textContent=num(readings.temperature);
    $("humidity").textContent=num(readings.humidity);
    $("pressure").textContent=num(readings.pressure);
    $("water").textContent=num(readings.water_distance_cm,1);
    setWaterLevelStatus(readings.water_distance_cm);
    $("pulse").textContent=num(readings.water_pulse_us,0);
    $("voltage").textContent=num(readings.solar_voltage,3);
    $("current").textContent=num(readings.solar_current_ma,1);
    $("power").textContent=num(readings.solar_power_mw,1);
  }catch(e){
    console.error("Latest:",e);
    setStatus("OFFLINE");
  }
}

function dynamicAxisRange(values,padding,minLimit=null,maxLimit=null){
  const valid=values
    .map(Number)
    .filter(Number.isFinite);

  if(!valid.length){
    return{
      min:minLimit,
      max:maxLimit
    };
  }

  const dataMin=Math.min(...valid);
  const dataMax=Math.max(...valid);
  const span=dataMax-dataMin;

  let pad=padding;

  if(span>0){
    pad=Math.max(padding,span*.10);
  }

  let min=dataMin-pad;
  let max=dataMax+pad;

  if(minLimit!==null)min=Math.max(minLimit,min);
  if(maxLimit!==null)max=Math.min(maxLimit,max);

  if(min===max){
    min=dataMin-padding;
    max=dataMax+padding;
  }

  return{min,max};
}

function chartOptions(){
  const light=document.documentElement.getAttribute("data-theme")==="light";
  return{
    responsive:true,
    maintainAspectRatio:false,
    interaction:{mode:"index",intersect:false},
    animation:{duration:500},
    plugins:{
      legend:{
        position:"top",
        align:"start",
        labels:{
          color:light?"#5f707b":"#9fb1c5",
          boxWidth:10,
          boxHeight:10,
          padding:18,
          font:{size:10}
        }
      },
      tooltip:{
        backgroundColor:light?"rgba(255,255,255,.96)":"rgba(5,17,30,.94)",
        borderColor:light?"rgba(35,55,70,.14)":"rgba(100,180,220,.16)",
        borderWidth:1,
        titleColor:light?"#17232d":"#edf6ff",
        bodyColor:light?"#52636e":"#b9cadb",
        padding:10,
        displayColors:true
      }
    },
    scales:{
      x:{
        ticks:{color:light?"#70818b":"#647e97",maxTicksLimit:10,font:{size:9}},
        grid:{color:light?"rgba(35,55,70,.055)":"rgba(255,255,255,.035)"},
        border:{display:false}
      },
      y:{
        ticks:{color:light?"#70818b":"#647e97",font:{size:9}},
        grid:{color:light?"rgba(35,55,70,.055)":"rgba(255,255,255,.045)"},
        border:{display:false}
      }
    }
  };
}

function environmentChartOptions(r){
  const options=chartOptions();

  const temperatureRange=dynamicAxisRange(
    r.map(a=>a.temperature),
    2
  );

  const humidityRange=dynamicAxisRange(
    r.map(a=>a.humidity),
    5,
    0,
    100
  );

  const pressureRange=dynamicAxisRange(
    r.map(a=>a.pressure),
    5
  );

  options.scales={
    x:options.scales.x,
    temperature:{
      type:"linear",
      position:"left",
      min:temperatureRange.min,
      max:temperatureRange.max,
      title:{
        display:true,
        text:"Temperature °C",
        color:document.documentElement.getAttribute("data-theme")==="light"?"#70818b":"#647e97",
        font:{size:9,weight:"600"}
      },
      ticks:{
        color:document.documentElement.getAttribute("data-theme")==="light"?"#70818b":"#647e97",
        font:{size:9}
      },
      grid:{
        color:document.documentElement.getAttribute("data-theme")==="light"?"rgba(35,55,70,.055)":"rgba(255,255,255,.045)"
      },
      border:{display:false}
    },
    humidity:{
      type:"linear",
      position:"right",
      min:humidityRange.min,
      max:humidityRange.max,
      title:{
        display:true,
        text:"Humidity %",
        color:document.documentElement.getAttribute("data-theme")==="light"?"#70818b":"#647e97",
        font:{size:9,weight:"600"}
      },
      ticks:{
        color:document.documentElement.getAttribute("data-theme")==="light"?"#70818b":"#647e97",
        font:{size:9}
      },
      grid:{
        drawOnChartArea:false
      },
      border:{display:false}
    },
    pressure:{
      type:"linear",
      position:"right",
      min:pressureRange.min,
      max:pressureRange.max,
      offset:true,
      title:{
        display:true,
        text:"Pressure hPa",
        color:document.documentElement.getAttribute("data-theme")==="light"?"#70818b":"#647e97",
        font:{size:9,weight:"600"}
      },
      ticks:{
        color:document.documentElement.getAttribute("data-theme")==="light"?"#70818b":"#647e97",
        font:{size:9}
      },
      grid:{
        drawOnChartArea:false
      },
      border:{display:false}
    }
  };

  return options;
}

async function history(){
  try{
    const h=Number($("range").value);
    const x=await get(`${API}/api/tasikfkee/history?hours=${h}`);
    const r=normalizeHistoryRows(x);
    const labels=r.map(a=>new Date(a._time).toLocaleTimeString("en-MY",{hour:"2-digit",minute:"2-digit"}));

    if(envChart)envChart.destroy();

    envChart=new Chart($("env"),{
      type:"line",
      data:{
        labels,
        datasets:[
          {
            label:"Temperature °C",
            data:r.map(a=>a.temperature),
            yAxisID:"temperature",
            tension:.28,
            spanGaps:true,
            borderWidth:2,
            pointRadius:0,
            pointHoverRadius:4
          },
          {
            label:"Humidity %",
            data:r.map(a=>a.humidity),
            yAxisID:"humidity",
            tension:.28,
            spanGaps:true,
            borderWidth:2,
            pointRadius:0,
            pointHoverRadius:4
          },
          {
            label:"Pressure hPa",
            data:r.map(a=>a.pressure),
            yAxisID:"pressure",
            tension:.28,
            spanGaps:true,
            borderWidth:2,
            pointRadius:0,
            pointHoverRadius:4
          }
        ]
      },
      options:environmentChartOptions(r)
    });

    if(waterLevelChart)waterLevelChart.destroy();

    waterLevelChart=new Chart($("waterLevel"),{
      type:"line",
      data:{
        labels,
        datasets:[
          {
            label:"Water level cm",
            data:r.map(a=>a.water_distance_cm),
            tension:.22,
            spanGaps:true,
            borderWidth:2,
            pointRadius:0,
            pointHoverRadius:4
          }
        ]
      },
      options:chartOptions()
    });

    if(solarChart)solarChart.destroy();

    solarChart=new Chart($("solar"),{
      type:"line",
      data:{
        labels,
        datasets:[
          {label:"Voltage V",data:r.map(a=>a.solar_voltage),tension:.28,spanGaps:true,borderWidth:2,pointRadius:0,pointHoverRadius:4},
          {label:"Current mA",data:r.map(a=>a.solar_current_ma),tension:.28,spanGaps:true,borderWidth:2,pointRadius:0,pointHoverRadius:4},
          {label:"Power mW",data:r.map(a=>a.solar_power_mw),tension:.28,spanGaps:true,borderWidth:2,pointRadius:0,pointHoverRadius:4}
        ]
      },
      options:chartOptions()
    });
  }catch(e){
    console.error("History:",e);
  }
}

$("range").addEventListener("change",history);

latest();
history();

setInterval(latest,5000);
setInterval(history,60000);


/* Refresh existing charts when the theme changes. */
window.updateChartTheme=function(){
  [waterLevelChart,solarChart].forEach(function(chart){
    if(!chart) return;
    chart.options=chartOptions();
    chart.update("none");
  });

  if(envChart){
    const labels=envChart.data.labels||[];
    const datasets=envChart.data.datasets||[];
    const temperatureData=datasets[0]?.data||[];
    const humidityData=datasets[1]?.data||[];
    const pressureData=datasets[2]?.data||[];

    const rows=labels.map((label,i)=>({
      temperature:temperatureData[i],
      humidity:humidityData[i],
      pressure:pressureData[i]
    }));

    envChart.options=environmentChartOptions(rows);
    envChart.update("none");
  }
};

/* =========================================================
   Theme toggle
   ========================================================= */
(function initTheme(){
  const root = document.documentElement;
  const button = document.getElementById("themeToggle");
  if (!button) return;

  let saved = null;
  try {
    saved = localStorage.getItem("tasikfkee-theme");
  } catch (e) {}

  // Dark mode is the default for new visitors.
  const initial = saved === "light" ? "light" : "dark";

  function applyTheme(theme){
    root.setAttribute("data-theme", theme);
    const light = theme === "light";
    button.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
    button.setAttribute("title", light ? "Switch to dark mode" : "Switch to light mode");
    const icon = button.querySelector(".theme-icon");
    const label = button.querySelector(".theme-toggle-label");
    if (icon) icon.textContent = light ? "☾" : "☀";
    if (label) label.textContent = light ? "Dark" : "Light";
    try {
      localStorage.setItem("tasikfkee-theme", theme);
    } catch (e) {}

    // Update Chart.js colors if the dashboard exposes the chart instances.
    if (typeof window.updateChartTheme === "function") {
      window.updateChartTheme();
    }
  }

  applyTheme(initial);

  button.addEventListener("click", function(){
    applyTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light");
  });
})();
