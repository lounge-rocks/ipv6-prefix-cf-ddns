import { createServer, IncomingMessage, ServerResponse } from "http";
import { host, port, token, zones } from "./config.json";

var cf = require("cloudflare")({
    token: token,
});

function hasKey<O>(obj: O, key: PropertyKey): key is keyof O {
    return key in obj;
}

const server = createServer(
    async (request: IncomingMessage, response: ServerResponse) => {
        if (request.url == null) {
            response.writeHead(404);
            response.end("No URL specified");
            return;
        }

        const args = request.url?.split("/");
        if (args?.length < 3) {
            return response.end("Invalid request");
        }
        const zone_name = args[1];
        const prefix = get_prefix(args[2]);

        if (hasKey(zones, zone_name)) {
            const zone_id = zones[zone_name].zone_id;

            let records = await cf.dnsRecords.browse(zone_id);

            let resp = "";
            for (const mac in zones[zone_name].hosts) {
                if (hasKey(zones[zone_name].hosts, mac)) {
                    let record_exists = false;
                    let got_record = { content: "", id: "", proxied: false };
                    for (const record of records["result"]) {
                        if (
                            record.name.split(".")[0] ==
                                zones[zone_name].hosts[mac].name &&
                            record.type == "AAAA"
                        ) {
                            got_record = record;
                            record_exists = true;
                            break;
                        }
                    }

                    if (record_exists) {
                        got_record["content"] = mactoeui(mac, prefix)!;
                        got_record["proxied"] = zones[zone_name].hosts[mac].proxied;
                        let record = await cf.dnsRecords.edit(
                            zone_id,
                            got_record.id,
                            got_record,
                        );
                        console.log("updated ", JSON.stringify(record));
                        resp += "updated " + JSON.stringify(record) + "\n";
                    } else {
                        let record = await cf.dnsRecords.add(zone_id, {
                            name: zones[zone_name].hosts[mac].name + "." + zone_name,
                            type: "AAAA",
                            content: mactoeui(mac, prefix)!,
                            proxied: zones[zone_name].hosts[mac].proxied,
                            ttl: 1,
                        });

                        console.log("added ", JSON.stringify(record));
                        resp += "added " + JSON.stringify(record) + "\n";
                    }
                } else {
                    console.log("zone_name no mac??");
                    resp += "zone_name no mac??\n";
                }
            }
            response.writeHead(200);
            return response.end(resp);
        } else {
            response.writeHead(404);
            return response.end("Invalid zone");
        }
    },
);

server.listen(port, parseInt(host), () => {
    console.log(`Server is running on http://${host}:${port}`);
});


// taken from http://silmor.de/ipaddrcalc.html#ip6
// Network Prefix <INPUT>::/64
// 48bit MAC -> 64bit Host ID ::/64
// IP Network Prefix :: Host ID/64

function mactoeui(mac48: String, prefix: number[] = ip6null()) {
    let mac = mac48.replace(/:/g, "-").split("-");
    if (mac.length != 6) {
        console.error("Not a MAC address.");
        return;
    }
    var ip6 = prefix;
    ip6[4] = (hex2dec(mac[0]) << 8) | hex2dec(mac[1]);
    ip6[4] ^= 0x200;
    ip6[5] = (hex2dec(mac[2]) << 8) | 0xff;
    ip6[6] = hex2dec(mac[3]) | 0xfe00;
    ip6[7] = (hex2dec(mac[4]) << 8) | hex2dec(mac[5]);
    return ip6toString(ip6);
}

//convert ipv6 array to string
function ip6toString(ar: number[]): string {
    //init
    var str = "";
    //find longest stretch of zeroes
    var zs = -1,
        zsf = -1;
    var zl = 0,
        zlf = 0;
    var md = 0;
    for (var i = 0; i < 8; i++) {
        if (md) {
            if (ar[i] == 0) zl++;
            else md = 0;
        } else {
            if (ar[i] == 0) {
                zs = i;
                zl = 1;
                md = 1;
            }
        }
        if (zl > 2 && zl > zlf) {
            zlf = zl;
            zsf = zs;
        }
    }
    //print
    for (var i = 0; i < 8; i++) {
        if (i == zsf) {
            str += ":";
            i += zlf - 1;
            if (i >= 7) str += ":";
            continue;
        }
        if (i) str += ":";
        str += dec2hex(ar[i]);
    }
    return str;
}

function parseIp6(str: string): number[] {
    //init
    var ar = new Array();
    for (var i = 0; i < 8; i++) ar[i] = 0;
    //check for trivial IPs
    if (str == "::") return ar;
    //parse
    var sar = str.split(":");
    var slen = sar.length;
    if (slen > 8) slen = 8;
    var j = 0;
    for (var i = 0; i < slen; i++) {
        //this is a "::", switch to end-run mode
        if (i && sar[i] == "") {
            j = 9 - slen + i;
            continue;
        }
        ar[j] = parseInt("0x0" + sar[i]);
        j++;
    }

    return ar;
}

function get_prefix(ip: string): number[] {
    var ar = parseIp6(ip);
    console.log("ip", JSON.stringify(ar));
    var prefix = new Array();
    for (var i = 0; i < 4; i++) {
        prefix[i] = ar[i];
    }
    for (var i = 4; i < 8; i++) {
        prefix[i] = 0;
    }
    return prefix;
}

//generate a null ipv6 array
function ip6null(): number[] {
    var ar = new Array();
    for (var i = 0; i < 8; i++) ar[i] = 0;
    return ar;
}

function dec2hex(val: number): string {
    var str = "";
    var minus = false;
    if (val < 0) {
        minus = true;
        val *= -1;
    }
    val = Math.floor(val);
    while (val > 0) {
        var v = (val % 16).toString();
        val /= 16;
        val = Math.floor(val);
        switch (v) {
            case "10":
                v = "A";
                break;
            case "11":
                v = "B";
                break;
            case "12":
                v = "C";
                break;
            case "13":
                v = "D";
                break;
            case "14":
                v = "E";
                break;
            case "15":
                v = "F";
                break;
        }
        str = v + str;
    }
    if (str == "") str = "0";
    if (minus) str = "-" + str;
    return str;
}

//convert hex to decimal
function hex2dec(val: string): number {
    return parseInt("0x" + val);
}
