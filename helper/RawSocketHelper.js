const raw = require('raw-socket');

class RawSocketHelper{

    /**
     * 传入一个可选项创建一个原始套接字
     * @param options
     * @param isRaw
     */
    constructor(options = {
        protocol: raw.Protocol.ICMP
    }, isRaw = true) {
        this.socket = raw.createSocket(options);
        this.setOption = this.setOption.bind(this);

        //开启IP首部自定义
        if(isRaw) {
            this.setOption(raw.SocketLevel.IPPROTO_IP, raw.SocketOption.IP_HDRINCL,
                new Buffer ([0x00, 0x00, 0x00, 0x01]), 4)
        }
    }

    /**
     * 设置IP选项
     * @param level
     * @param option
     * @param value
     * @param length
     */
    setOption(level, option, value, length) {
        if(arguments.length >= 3) {
            this.socket.setOption(level, option, value, length);
        } else {
            this.socket.setOption(level, option, value);
        }
    }

    /**
     * 发送IP包
     * @param buffer
     * @param start
     * @param length
     * @param callback
     */
    rawSend(buffer, start = 0, length = buffer.length, callback) {
        this.socket.send(buffer, start, length, '192.169.1.4', callback);
    }
}


module.exports = RawSocketHelper;
