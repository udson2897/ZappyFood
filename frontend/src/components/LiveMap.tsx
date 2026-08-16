import { WebView } from "react-native-webview";
import { StyleSheet, View } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

type Props = {
  code: string;
  dest?: { lat: number; lng: number } | null;
  store?: { lat: number; lng: number } | null;
  height?: number;
};

function buildHtml({ code, dest, store }: Props) {
  const destJs = dest && dest.lat != null ? `[${dest.lat},${dest.lng}]` : "null";
  const storeJs = store && store.lat != null ? `[${store.lat},${store.lng}]` : "null";
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{height:100%;margin:0;padding:0;background:#eee}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var API="${BASE}/api/courier/order/${code}/location";
var dest=${destJs}, store=${storeJs};
var map=L.map('map',{zoomControl:true});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
var pts=[];
var destIcon=L.divIcon({html:'<div style="font-size:26px">🏠</div>',className:'',iconSize:[26,26],iconAnchor:[13,26]});
var storeIcon=L.divIcon({html:'<div style="font-size:24px">🏪</div>',className:'',iconSize:[24,24],iconAnchor:[12,24]});
var courierIcon=L.divIcon({html:'<div style="font-size:26px">🛵</div>',className:'',iconSize:[26,26],iconAnchor:[13,13]});
if(dest){L.marker(dest,{icon:destIcon}).addTo(map).bindPopup('Cliente');pts.push(dest);}
if(store){L.marker(store,{icon:storeIcon}).addTo(map).bindPopup('Loja');pts.push(store);}
if(pts.length){map.fitBounds(pts,{padding:[40,40]});}else{map.setView([-23.55,-46.63],13);}
var courierMarker=null, line=null;
function upd(){
  fetch(API).then(function(r){return r.json();}).then(function(d){
    if(d&&d.lat!=null){
      var c=[d.lat,d.lng];
      if(!courierMarker){courierMarker=L.marker(c,{icon:courierIcon}).addTo(map).bindPopup('Entregador');}
      else{courierMarker.setLatLng(c);}
      if(dest){
        if(line){map.removeLayer(line);}
        line=L.polyline([c,dest],{color:'#FF5A00',weight:4,opacity:0.8,dashArray:'6,8'}).addTo(map);
        map.fitBounds([c,dest],{padding:[50,50]});
      }
    }
  }).catch(function(){});
}
upd(); setInterval(upd, 4000);
</script></body></html>`;
}

export default function LiveMap(props: Props) {
  const html = buildHtml(props);
  return (
    <View style={[styles.wrap, { height: props.height || 240 }]}>
      <WebView
        testID="live-map"
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: "hidden", backgroundColor: "#eee" },
  web: { flex: 1, backgroundColor: "transparent" },
});
