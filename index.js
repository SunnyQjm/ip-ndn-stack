const {
    Data,
    WireFormat
} = require('./library');
const {
    NFDHelper,
    PcapHelper,
    RawSocketHelper
} = require('./helper');
const fs = require('fs');
const uuid = require('uuid');
const arguments = process.argv.splice(2);

// 得到配置信息
const config = JSON.parse(fs.readFileSync(arguments[0]).toString());


const prePrefix = '/IP/pre/';
const getDataPrefix = '/IP/';

const ipPacketCache = {};

const timeCalcute = {};

const nfdHelper = new NFDHelper();
const rawSocketHelper = new RawSocketHelper();

// 监听配置文件重指定的网络接口到来的IPv4包
new PcapHelper(config.dev, config.filter)
    .on('packet', (packet, raw_packet) => {
        // console.log(packet.payload.payload.saddr + ' -> ' + packet.payload.payload.daddr);

        const sourceIp = packet.payload.payload.saddr;
        const destIp = packet.payload.payload.daddr;

        // 构造一个预请求的Interest名字
        let uid = uuid();              //给某个IP包进行索引
        let name = `${prePrefix}${destIp}/${sourceIp}/${uid}`;

        // 先将IP包缓存到内存当中
        ipPacketCache[uid] = raw_packet.buf.slice(14, packet.pcap_header.len);
        timeCalcute[uid] = new Date().valueOf();

        // 发送一个预请求Interest，提醒一个可以到达目的主机的边界网关过来拉取IP包
        nfdHelper.expressInterest(name, () => {
            // console.log(`收到对pre request -> ${name} 的空回复`);
        })
    });

// //抓取并响应ARP包
// new PcapHelper(config.dev, config.arpFilter)
//     .on('packet', (packet, raw_packet) => {
//         console.log('======================ARP=====================');
//         console.log(packet.payload.shost + ' -> ' + packet.payload.dhost);
//         console.log(packet);
//         console.log('==============================================');
//     });

config.registerIp.forEach(ip => {

    // console.log(`deal ${ip}`);

    /**
     * 注册监听pre请求
     */
    nfdHelper
        .register(`${prePrefix}${ip}`, (prefix, interest, face, interestFilterId, filter) => {        //onInterest
            // 先对预请求响应一个空回复
            nfdHelper.echoEmpty(interest);

            const name = interest.getName().toUri();
            // console.log(`收到Interest <- ${name}`);
            let components = name.substring(prePrefix.length, name.length).split('/');
            let destIp = components[0];
            let sourceIp = components[1];
            let uid = components[2];
            // 接着构造新的请求来拉取IP包
            nfdHelper.expressInterest(`${getDataPrefix}${sourceIp}/${destIp}/${uid}`, (interest, data) => {
                // 成功拉取到数据包，在此处理IP包的转发
                // console.log('成功拉取到数据包，开始处理数据包转发');
                // console.log(data.getContent().buffer.length);
                // const packet = PcapHelper.decodeIPv4Packet(data.getContent().buffer);

                rawSocketHelper.rawSend(data.getContent().buffer, 0, data.getContent().buffer.length, destIp, function (error, bytes) {
                    if (error) {
                        console.log (error.toString ());
                    } else {
                        // console.log ("sent " + bytes + " bytes to " + packet.daddr);
                    }
                });
            })
        });

    /**
     * 注册监听拉取数据请求
     */
    nfdHelper
        .register(`/IP/${ip}`, (prefix, interest, face, interestFilterId, filter) => {        //onInterest

            const name = interest.getName();

            const data = new Data(interest.getName());
            let components = name.toUri()
                .substring(prePrefix.length, name.toUri().length).split('/');
            let uid = components[2];
            let destIp = components[1];
            let sourceIp = components[0];
            let packet = ipPacketCache[uid];
            if(!packet) {
                console.log(`缓存中没有: ${sourceIp} -> ${destIp}, uuid = ${uid} 的数据包`);
                return;
            }
            let endTime = new Date().valueOf();
            console.log(timeCalcute[uid] + '->' + endTime);
            console.log(timeCalcute[uid] - endTime);
            data.setContent(ipPacketCache[uid]);
            delete ipPacketCache[uid];
            nfdHelper.keyChain.sign(data);
            // console.log(`maxNdnPacketSize: ${nfdHelper.face.getMaxNdnPacketSize()}`);
            try {
                face.putData(data);
            } catch (e) {
                console.error(e);
            }
        });
});


