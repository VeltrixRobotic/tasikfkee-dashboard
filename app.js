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
    $("pulse").textContent=num(d.water_pulse_us,0);
    $("voltage").textContent=num(d.solar_voltage,3);
    $("current").textContent=num(d.solar_current_ma,1);
    $("power").textContent=num(d.solar_power_mw,1);
  }catch(e){
    console.error("Latest:",e);
    setStatus("OFFLINE");
  }
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
          {label:"Temperature °C",data:r.map(a=>a.temperature),tension:.28,borderWidth:2,pointRadius:0,pointHoverRadius:4},
          {label:"Humidity %",data:r.map(a=>a.humidity),tension:.28,borderWidth:2,pointRadius:0,pointHoverRadius:4},
          {label:"Pressure hPa",data:r.map(a=>a.pressure),tension:.28,borderWidth:2,pointRadius:0,pointHoverRadius:4}
        ]
      },
      options:chartOptions()
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
  [envChart,waterLevelChart,solarChart].forEach(function(chart){
    if(!chart) return;
    chart.options=chartOptions();
    chart.update("none");
  });
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
