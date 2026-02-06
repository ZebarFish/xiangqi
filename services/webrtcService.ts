
import { RealtimeChannel } from '@supabase/supabase-js';

const STUN_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ],
};

type SignalData = 
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }
  | { type: 'request-offer' };

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private channel: RealtimeChannel | null = null;
  private onRemoteStreamCallback: ((stream: MediaStream) => void) | null = null;
  private isInitiator: boolean = false;

  constructor() {}

  async init(
    channel: RealtimeChannel, 
    userId: string, 
    onRemoteStream: (stream: MediaStream) => void
  ) {
    this.channel = channel;
    this.onRemoteStreamCallback = onRemoteStream;

    // Listen for signaling messages from Supabase
    this.channel.on('broadcast', { event: 'signal' }, async (payload) => {
      // Don't process our own messages (Supabase echoes broadcast by default mostly to others, but good safety)
      if (payload.payload.senderId === userId) return;
      await this.handleSignal(payload.payload);
    });
  }

  async startLocalStream(): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 320, height: 240, facingMode: 'user' }, 
        audio: { echoCancellation: true, noiseSuppression: true } 
      });
      this.localStream = stream;
      return stream;
    } catch (e) {
      console.error("Error accessing media devices:", e);
      throw e;
    }
  }

  createPeerConnection(senderId: string) {
    if (this.peerConnection) return;

    this.peerConnection = new RTCPeerConnection(STUN_SERVERS);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        if(this.localStream) this.peerConnection!.addTrack(track, this.localStream);
      });
    }

    // Handle remote track
    this.peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        this.remoteStream = remoteStream;
        if (this.onRemoteStreamCallback) this.onRemoteStreamCallback(remoteStream);
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(senderId, { type: 'candidate', candidate: event.candidate.toJSON() });
      }
    };
  }

  async startCall(senderId: string) {
    this.isInitiator = true;
    this.createPeerConnection(senderId);
    
    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);
    
    await this.sendSignal(senderId, { type: 'offer', sdp: offer });
  }

  async handleSignal(data: any) {
    const { type, senderId, ...payload } = data;

    if (!this.peerConnection && type !== 'request-offer') {
       this.createPeerConnection(senderId); // Create PC if receiving offer
    }

    try {
      switch (type) {
        case 'offer':
          if (!this.peerConnection) return;
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          await this.sendSignal(senderId, { type: 'answer', sdp: answer });
          break;

        case 'answer':
          if (!this.peerConnection) return;
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          break;

        case 'candidate':
          if (!this.peerConnection) return;
          if (payload.candidate) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
          }
          break;
        
        case 'request-offer':
          // Another user joined and asked for an offer
          if (!this.isInitiator) {
             await this.startCall(senderId);
          }
          break;
      }
    } catch (e) {
      console.error("Signaling error", e);
    }
  }

  private async sendSignal(senderId: string, data: SignalData) {
    if (!this.channel) return;
    await this.channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { ...data, senderId } // senderId is ME
    });
  }
  
  // When a new user joins, existing users should try to connect
  async requestConnection(senderId: string) {
      await this.sendSignal(senderId, { type: 'request-offer' });
  }

  cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
  }
}

export const webrtcService = new WebRTCService();
