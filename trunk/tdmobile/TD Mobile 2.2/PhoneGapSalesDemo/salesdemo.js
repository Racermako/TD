document.addEventListener("deviceready", onDeviceReady, false);

// device APIs are available
function onDeviceReady() {
	$("#app-status-ul").append('<li>deviceready event received</li>');
                
	try { 
      	var pushNotification = window.plugins.pushNotification;
        pushNotification.register(successHandler, errorHandler, {"senderID":"<Your Project ID>","ecb":"onNotification"});
   	}
	catch(err) { 
		txt="There was an error on this page.\n\n"; 
		txt+="Error description: " + err.message + "\n\n"; 
		alert(txt); 
	}
}

window.onNotification = function(e) {
	$("#app-status-ul").append('<li>EVENT -> RECEIVED:' + e.event + '</li>');
	
	switch( e.event )
	{
		case 'registered':
			if ( e.regid.length > 0 ){
				$("#app-status-ul").append('<li>REGISTERED -> REGID:' + e.regid + "</li>");
				window.salesDemoDeviceId = e.regid;
			}
			break;
		case 'message':
			// if this flag is set, this notification happened while we were in the foreground.
			// you might want to play a sound to get the user's attention, throw up a dialog, etc.
			
			Td.Util.alert(e.payload.message);
			
			if (e.foreground){
				$("#app-status-ul").append('<li>--INLINE NOTIFICATION--' + '</li>');
			}
			else {	
				// otherwise we were launched because the user touched a notification in the notification tray.
				if (e.coldstart)
					$("#app-status-ul").append('<li>--COLDSTART NOTIFICATION--' + '</li>');
				else
					$("#app-status-ul").append('<li>--BACKGROUND NOTIFICATION--' + '</li>');
			}
				
			$("#app-status-ul").append('<li>MESSAGE -> MSG: ' + e.payload.message + '</li>');
			//android only
			$("#app-status-ul").append('<li>MESSAGE -> MSGCNT: ' + e.payload.msgcnt + '</li>');
			//amazon-fireos only
			$("#app-status-ul").append('<li>MESSAGE -> TIMESTAMP: ' + e.payload.timeStamp + '</li>');
			break;
		case 'error':
			$("#app-status-ul").append('<li>ERROR -> MSG:' + e.msg + '</li>');
			break;
		default:
			$("#app-status-ul").append('<li>EVENT -> Unknown, an event was received and we do not know what it is</li>');
		break;
	}
}

function successHandler (result) {
  	$("#app-status-ul").append('<li>success:'+ result +'</li>');
 }
            
 function errorHandler (error) {
  	$("#app-status-ul").append('<li>error:'+ error +'</li>');
  }