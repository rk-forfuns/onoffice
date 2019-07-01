/*
    This system takes care of all the communication required to get WebRTC setup
 */
AFRAME.registerSystem('webrtc', {
    pc: null,
    onAddStreamFunc: null,

    init: function() {
        this.pc = new RTCPeerConnection({  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }] });
        window.setTimeout(() => {
            this.connect();
        });
    },

    connect: function() {
        const socket = this.el.systems['socket'];
        socket.on('webrtc-message', (message) => {
            if(message.sdp) {
                this.pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
                    if(message.sdp.type === 'offer') {
                        this.pc.createAnswer((description) => {
                            this.pc.setLocalDescription(description, () => {
                                socket.emit('webrtc-message', {'sdp': description});
                            }, () => {
                                console.error('set description error')
                            });
                        }, (error) => {
                            console.error('Create answer error', error);
                        });
                    }
                }, (error) => {
                    console.error('Error while settings remote description', error);
                });
            } else if(message.ice) {
                this.pc.addIceCandidate(new RTCIceCandidate(message.ice));
            }
        });

        this.pc.onaddstream = (event) => {
            if(this.onAddStreamFunc) {
                this.onAddStreamFunc(event);
            }
        };
    }
});
