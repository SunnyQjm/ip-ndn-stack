const pcap = require('pcap');

class PcapHelper {
    /**
     * 默认只抓取IPv4包，可以通过传递filter参数改变这一默认行为
     * @param dev
     * @param filter
     */
    constructor(dev, filter = 'ether proto \\ip') {
        this.pcapSession = pcap.createSession(dev, filter);
    }

    on(event, callback) {
        this.pcapSession.on(event, (raw_packet) => {
            const packet = pcap.decode.packet(raw_packet);
            callback(packet, raw_packet);
        });
    }
}


module.exports = PcapHelper;