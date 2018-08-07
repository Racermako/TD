@echo off

echo Creating Cordova Project

call cordova create SalesDemoPush com.gupta.examples.SalesDemoPush  SalesDemoPush

cd SalesDemoPush

echo Adding Android Platform

call cordova platform add android

echo Adding Push Plugin

call cordova plugin add phonegap-plugin-push

echo Adding Barcode Plugin

call cordova plugin add phonegap-plugin-barcodescanner

echo Adding Contacts Plugin

call cordova plugin add cordova-plugin-contacts

