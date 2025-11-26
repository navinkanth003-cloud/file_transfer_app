export const getIceServers = () => {
    // Robust list of free public STUN servers
    // We include port 443 servers to help bypass firewalls
    const servers = [
        // Google - Reliable, standard
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },

        // Twilio - Reliable
        { urls: 'stun:global.stun.twilio.com:3478' },

        // Port 443 Servers (Firewall Bypassing)
        // These are crucial for restrictive networks that block non-web ports
        { urls: 'stun:stun.nextcloud.com:443' },
        { urls: 'stun:stun.piratenparty.de:3478' },
        { urls: 'stun:stun.voip.blackberry.com:3478' },
        { urls: 'stun:stunserver.org:3478' },
    ];

    // TODO: Add your TURN server credentials here if STUN fails
    // Example format for Metered.ca or OpenRelay:
    /*
    servers.push({
        urls: "turn:your-turn-server.com:80",
        username: "your-username",
        credential: "your-password"
    });
    */

    return servers;
};
