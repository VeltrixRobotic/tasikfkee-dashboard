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
  }else if(state==="MAINTENANCE"){
    cls="maintenance";
    label="MAINTENANCE";
  }

  box.className="top-status "+cls;
  $("statusText").textContent=label;
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

async function latest(){
  try{
    const x=await get(API+"/api/tasikfkee/latest");
    const d=x.data||{};

    setStatus(x.status);

    $("updated").textContent=time(x.received_at||x.last_seen);
    $("temperature").textContent=num(d.temperature);
    $("humidity").textContent=num(d.humidity);
    $("pressure").textContent=num(d.pressure);
    $("water").textContent=num(d.water_distance_cm,1);
    setWaterLevelStatus(d.water_distance_cm);
    $("pulse").textContent=num(d.water_pulse_us,0);
    $("voltage").textContent=num(d.solar_voltage,3);
    $("current").textContent=num(d.solar_current_ma,1);
    $("power").textContent=num(d.solar_power_mw,1);
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
    const r=x.data||[];
    const labels=r.map(a=>new Date(a.time).toLocaleTimeString("en-MY",{hour:"2-digit",minute:"2-digit"}));

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
            borderWidth:2,
            pointRadius:0,
            pointHoverRadius:4
          },
          {
            label:"Humidity %",
            data:r.map(a=>a.humidity),
            yAxisID:"humidity",
            tension:.28,
            borderWidth:2,
            pointRadius:0,
            pointHoverRadius:4
          },
          {
            label:"Pressure hPa",
            data:r.map(a=>a.pressure),
            yAxisID:"pressure",
            tension:.28,
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
          {label:"Voltage V",data:r.map(a=>a.solar_voltage),tension:.28,borderWidth:2,pointRadius:0,pointHoverRadius:4},
          {label:"Current mA",data:r.map(a=>a.solar_current_ma),tension:.28,borderWidth:2,pointRadius:0,pointHoverRadius:4},
          {label:"Power mW",data:r.map(a=>a.solar_power_mw),tension:.28,borderWidth:2,pointRadius:0,pointHoverRadius:4}
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
