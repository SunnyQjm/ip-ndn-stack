const {
    Data,
    Name,
    Interest
} = require('./library');
const {
    NFDHelper,
    PcapHelper
} = require('./helper');
const fs = require('fs');
const uuid = require('uuid');
const arguments = process.argv.splice(2);

// 得到配置信息
const config = JSON.parse(fs.readFileSync(arguments[0]).toString());


const prePrefix = '/IP/pre/';
const getDataPrefix = '/IP/';

const ipPacketCache = {};

const nfdHelper = new NFDHelper();

// 监听配置文件重指定的网络接口到来的IPv4包
new PcapHelper(config.dev, config.filter)
    .on('packet', (packet, raw_packet) => {
        console.log(packet.payload.payload.saddr + ' -> ' + packet.payload.payload.daddr);

        const sourceIp = packet.payload.payload.saddr;
        const destIp = packet.payload.payload.daddr;

        // 构造一个预请求的Interest名字
        let uid = uuid();              //给某个IP包进行索引
        let name = `${prePrefix}${destIp}/${sourceIp}/${uid}`;

        // 先将IP包缓存到内存当中
        ipPacketCache[uid] = raw_packet;

        // 发送一个预请求Interest，提醒一个可以到达目的主机的边界网关过来拉取IP包
        nfdHelper.expressInterest(name, () => {
            console.log(`收到对pre request -> ${name} 的空回复`);
        })
    });

config.registerIp.forEach(ip => {

    console.log(`deal ${ip}`);

    /**
     * 注册监听pre请求
     */
    nfdHelper
        .register(`${prePrefix}${ip}`, (prefix, interest, face, interestFilterId, filter) => {        //onInterest
            // 先对预请求响应一个空回复
            nfdHelper.echoEmpty(interest);

            const name = interest.getName().toUri();
            console.log(name);
            console.log(name.split('/'));
            console.log(name.substring(prePrefix.length, name.length))
            console.log(name.substring(prePrefix.length, name.length).split('/'));
            let components = prefix.getName()
                .substring(prePrefix.length, interest.getName().toUri().length).split('/');
            console.log(components);
            console.log(prefix.getName());
            let destIp = components[0];
            let sourceIp = components[1];

            // 接着构造新的请求来拉取IP包
            nfdHelper.expressInterest(`${getDataPrefix}${sourceIp}/${destIp}/${uuid()}`, (interest, data) => {
                // 成功拉取到数据包，在此处理IP包的转发
                console.log('成功拉取到数据包，开始处理数据包转发');
            })
        });

    /**
     * 注册监听拉取数据请求
     */
    nfdHelper
        .register(`/IP/${ip}`, (prefix, interest, face, interestFilterId, filter) => {        //onInterest
            console.log('md?');
            console.log(`prefix -> ${JSON.stringify(prefix)}`);
            console.log(`interest ->`);
            console.log(interest.getName().toUri());
            console.log(interest.getMaxSuffixComponents());
            console.log(interest.getMinSuffixComponents());
            console.log(`face -> ${face}`);
            console.log(`interestFilterId -> ${interestFilterId}`);
            console.log(`filter -> ${filter}`);

            const data = new Data(interest.getName());
            let components = prefix.getName()
                .substring(prePrefix.length, interest.getName().length).split('/');
            let uid = components[2];
            let destIp = components[1];
            let sourceIp = components[0];
            let packet = ipPacketCache[uid];
            if(!packet) {
                console.log(`缓存中没有: ${sourceIp} -> ${destIp}, uuid = ${uid} 的数据包`);
                return;
            }
            data.setContent(ipPacketCache[uid]);
            delete ipPacketCache[uid];
            nfdHelper.keyChain.sign(data);
            try {
                face.putData(data);
            } catch (e) {
                console.error(e);
            }
        });
});


