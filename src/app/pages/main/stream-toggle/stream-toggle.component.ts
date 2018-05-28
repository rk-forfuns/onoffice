import {Component, Input} from '@angular/core';
import {SourceSelection} from '../source-toggle/source-toggle.component';
import {SocketService} from '../../../shared/socket.service';
import {AppStatus} from '../main.page';
import {ElectronService} from 'ngx-electron';

@Component({
    selector: 'app-stream-toggle',
    templateUrl: 'stream-toggle.component.html'
})
export class StreamToggleComponent {
    @Input() sources: SourceSelection[];
    @Input() status: AppStatus;

    private pc: RTCPeerConnection;

    constructor(private electronService: ElectronService, private socketService: SocketService) { }

    public onClick() {
        if (this.status.current === 'inactive') {
            this.startStreaming();
        } else {
            this.stopStreaming();
        }
    }

    private startStreaming() {
        this.status.current = 'waiting-for-client';

        this.socketService.emit('host');
        this.socketService.on('start', () => this.setupConnection());
    }

    private stopStreaming() {
        this.status.current = 'inactive';

        this.socketService.removeAllListeners('start');
        this.pc.close();
    }

    private setupConnection() {
        this.status.current = 'setting-up';

        const pc = new RTCPeerConnection(
            {
                iceServers:
                    [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }]
            });

        const selectedSources = this.sources.filter((source) => source.selected);
        selectedSources.forEach((source) => {
            const n = <any>navigator;
            n.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: source.source.id,
                    }
                }
            }).then((stream) => {
                pc.addStream(stream);

                this.electronService.remote.require('./components/virtual-cursor.component').registerDisplay(source.source.id, stream.id);

                if (pc.getLocalStreams().length === selectedSources.length) {
                    pc.createOffer((description) => {
                        pc.setLocalDescription(description, () => {
                            this.socketService.emit('webrtc-message', {'sdp': description});
                        }, () => {
                            console.log('set description error');
                        });
                    }, (error) => {
                        console.log('Error', error);
                    });
                }
            });
        });

        pc.addEventListener('iceconnectionstatechange', (event) => {
            console.log(event.currentTarget['iceConnectionState'], event.currentTarget['iceConnectionState'] === 'completed');
            if (event.currentTarget['iceConnectionState'] === 'completed') {
                console.log('Settign er to active');
                this.status.current = 'active';
            }

            if (event.currentTarget['iceConnectionState'] === 'disconnected') {
                this.status.current = 'waiting-for-client';
            }
        });

        pc.onicecandidate = (event) => {
            if (event.candidate != null) {
                this.socketService.emit('webrtc-message', {'ice': event.candidate});
            }
        };

        this.socketService.on('webrtc-message', (message) => {
            if (message.sdp) {
                pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
                    if (message.sdp.type === 'offer') {
                        pc.createAnswer((description) => {
                            pc.setLocalDescription(description, () => {
                                this.socketService.emit('webrtc-message', {'sdp': description});
                            }, () => {
                                console.log('set description error');
                            });
                        }, (error) => {
                            console.log(error);
                        });
                    }
                });
            } else if (message.ice) {
                pc.addIceCandidate(new RTCIceCandidate(message.ice));
            }
        });

        this.pc = pc;
    }
}