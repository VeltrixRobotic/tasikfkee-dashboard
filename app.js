const API="https://api.veltrixrobotic.com";
let envChart,solarChart;

const $=id=>document.getElementById(id);

const num=(v,d=2)=>
  Number.isFinite(Number(v))?Number(v).toFixed(d):"--";

const time=v=>{
  const d=new Date(v);
  return v&&!isNaN(d)
    ?d.toLocaleString("en-MY",{dateStyle:"medium",timeStyle:"medium"})
    :"--";
};

async function get(url){
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok)throw Error(r.status);
  return r.json();
}

function setStatus(s){
  const on=String(s).toUpperCase()==="ONLINE";
  const box=$("statusText").closest(".top-status");
  box.className="top-status "+(on?"online":"offline");
  $("statusText").textContent=on?"ONLINE":"OFFLINE";
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
          color:"#9fb1c5",
          boxWidth:10,
          boxHeight:10,
          padding:18,
          font:{size:10}
        }
      },
      tooltip:{
        backgroundColor:"rgba(5,17,30,.94)",
        borderColor:"rgba(100,180,220,.16)",
        borderWidth:1,
        titleColor:"#edf6ff",
        bodyColor:"#b9cadb",
        padding:10,
        displayColors:true
      }
    },
    scales:{
      x:{
        ticks:{color:"#647e97",maxTicksLimit:10,font:{size:9}},
        grid:{color:"rgba(255,255,255,.035)"},
        border:{display:false}
      },
      y:{
        ticks:{color:"#647e97",font:{size:9}},
        grid:{color:"rgba(255,255,255,.045)"},
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
          {label:"Water distance cm",data:r.map(a=>a.water_distance_cm),tension:.16,borderWidth:2,pointRadius:0,pointHoverRadius:4}
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
          {label:"Current mA",data:r.map(a=>a.solar_current_ma),tension:.28,borderWidth:2,pointRadius:0,pointHoverRadius:4}
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
