using System;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace PushNotificationLib
{
    public class PushUtil
    {
        private const String GOOGLE_API_KEY = "<Your API Key>";
        private const String GOOGLE_API_URL = "https://android.googleapis.com/gcm/send";

        static PushUtil()
        {
            ServicePointManager.ServerCertificateValidationCallback += new RemoteCertificateValidationCallback(ValidateServerCertificate);
        }

        public static bool SendNotification(String deviceId, String title, String message)
        {
            var result = SendGoogleNotification(deviceId, title, message);
            return true;
        }

        private static string SendGoogleNotification(String deviceId, String title, String message)
        {
            String responseTxt = "";

            String postData =
            "{ \"registration_ids\": [ \"" + deviceId + "\" ], " +
              "\"data\": {\"message\": \"" + message + "\", \"title\": \"" + title + "\"}}";

            ServicePointManager.ServerCertificateValidationCallback += new RemoteCertificateValidationCallback(ValidateServerCertificate);

            byte[] byteArray = Encoding.UTF8.GetBytes(postData);

            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(GOOGLE_API_URL);
            request.Method = "POST";
            request.KeepAlive = false;
            request.ContentType = "application/json";
            request.Headers.Add(string.Format("Authorization: key={0}", GOOGLE_API_KEY));
            request.ContentLength = byteArray.Length;

            using (Stream dataStream = request.GetRequestStream())
            {
                dataStream.Write(byteArray, 0, byteArray.Length);
            }

            try
            {
                WebResponse response = request.GetResponse();

                using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                {
                    responseTxt = reader.ReadToEnd();
                }
            }
            catch (Exception e)
            {
                responseTxt = e.Message;
            }
            return responseTxt;
        }

        private static bool ValidateServerCertificate(
            object sender,
            X509Certificate certificate,
            X509Chain chain,
            SslPolicyErrors sslPolicyErrors)
        {
            return true;
        }
    }
}
