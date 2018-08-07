** Note, you have to have the Cordova build folder in place before attempting to compile your TDM app **
** To install the Android SDK, you must first have Java SDK itself installed:  http://www.oracle.com/technetwork/java/javase/downloads/index.html (min v7) **
** To use the push plugin feature, you must use a google developer account to obtain both a project ID (used as "senderID" in salesdemo.js) and an API key
** that is used by the PushUtil C# project.  	


This sample uses Apache Cordova to create a native Android application.  To create the app:

- Install Android SDK (https://developer.android.com/sdk/index.html go to bottom of page, links to "SDK Tools Only")
	- Note that this will put the most recent version, Android 6.0 (API 23), on your machine, but we need Android 5.1.1 (API 22).
	  After installing this, launch the app "SDK Manager" from your Start Menu (Android SDK Tools->SDK Manager) and select following packages
	  to download and install.
		+ Android SDK Build-tools 22.0.1 in Tools
		+ Android 5.1.1 (API 22)
		  * If you have no plan to use Android Virtual Device (emulator), you don't need to install all system images.
		+ Android Support Repository (in Extras)
		+ Android Support Library
		+ Google Play services
		+ Google Repository
		+ Google USB Driver
	  It wants to put this in a "temp" folder underneath your Android home folder, so if you put Android in c:\Program Files (x86), 
	  you'll have to give rights to all users to be able to create subfolders.
- Create an environment variable called "ANDROID_HOME" and set its value to the path to your Android SDK folder. On normal 64bit Win7 
   systems this would be c:\Program Files (x86)\android\android-sdk
- Install node.js (https://nodejs.org/).  This is a Javascript runtime. Cordova uses it to run to run its build scripts. Node.js installs npm tool too.
- Install Apache Cordova (https://cordova.apache.org/)
   - "install" cordova by running this command from a command prompt:  npm install -g cordova
- run create_cordova_project.bat, this will create a directory SalesDemoPush, in the PhoneGapSalesDemo folder, with the android platform and plugins added
- Expand the build settings pane in the IDE (Settings->Build click on expand icon on bottom right), and:
	- Check enable Cordova
	- Make sure path to the SalesDemoPush directory is set (directory created by batch script in the previous step)
	- Update the URL the application will be pusblished as in IIS (i.e. http://host.com/Sales)
- Build TDM application, publish to IIS.  This is basically about getting the server-side logic into place on an IIS server.
- cd to SalesDemoPush folder, execute "corodva build android".  This will build an apk that can be installed on the device. 
	- If you have "USB debugging" enabled, and your device is connected to your computer with a USB cable,
		"cordova run android" will build and install the apk for you.
		"USB debugging" is a setting on your Android device, under the Settings->Developer Options.
	- If you set up Android Virtual Device and it's running (You can set it up by using Android SDK Tools->AVD Manager),
		"cordova run android --emulator"