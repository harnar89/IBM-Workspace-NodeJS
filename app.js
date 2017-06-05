import express from 'express';
import * as request from 'request';
import * as util from 'util';
import * as bparser from 'body-parser';
import { createHmac } from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as oauth from './oauth';
import * as ssl from './ssl';
import debug from 'debug';

var requests = require('request-promise');
var FormData = require('form-data');
var fs = require('fs');

const JARVIS_STG = "";
const headers =  { 'X-Test-Api-Key': ''};
var user_id = '';

// Debug log
const log = debug('watsonwork-echo-app');

// Echoes Watson Work chat messages containing 'hello' or 'hey' back
// to the space they were sent to
export const echo = (appId, token) => (req, res) => {
	// Respond to the Webhook right away, as the response message will
	// be sent asynchronously
	res.status(201).end();

	// Only handle message-created Webhook events, and ignore the app's
	// own messages
	if(req.body.type !== 'message-created' || req.body.userId === appId)
		return;

	log('Got a message %o', req.body);

	// React to 'hello' or 'hey' keywords in the message and send an echo
	// message back to the conversation in the originating space
	//if(req.body.content
	// Tokenize the message text into individual words
	//  .split(/[^A-Za-z0-9]+/)
	// Look for the hello and hey words
	//  .filter((word) => /^(hello|hey)$/i.test(word)).length)
	var annotations = [];
	var request_body = {
	       message: req.body.content,
	       user: user_id
	}
	var request_obj  = { method: 'POST', json: true, headers: headers,
	                       body: request_body, uri: JARVIS_STG};
	return requests(request_obj).then(function (rc) {
	  console.log(JSON.stringify(rc));

	  //Check for text within replies (where replies isn't an array)
	  if (rc.replies.text) {
		send(req.body.spaceId,
	    rc.replies.text,
	    token(),
	    (err, res) => {
	        if (!err) {
	        	log('Sent message to space %s', req.body.spaceId);
	    	}
	    });

		//Check for quick replies
	  	setTimeout(function() {
			if (rc.replies.quick_replies) {
		      	send(req.body.spaceId,
			        'Please select from the following options:',
			        token(),
			        (err, res) => {
			        	if(!err) {
			            	log('Sent message to space %s', req.body.spaceId);
			        	}
			    });
	  		}
	    }, 500);
	 
	    //Check for the quick replies
	    setTimeout(function() {
	    	if (rc.replies.quick_replies) {
	        	for(var i = 0; i < rc.replies.quick_replies.length; i++) {
	        	
	          		//setTimeout( function() {
	            	send(req.body.spaceId,
		        	rc.replies.quick_replies[i].title,
		        	token(),
		        	(err, res) => {
		          		if(!err) {
		            		log('Sent message to space %s', req.body.spaceId);
		            	}
		        	});
	        	}
	  		} 	
	    }, 1500);
	  }

	  if (rc.replies.length > 0) {
	 	setTimeout(function() {
		    //Loop through the replies
		    for (var i = 0; i < rc.replies.length; i++) {
		      //Check for display text
		        if (rc.replies[i].text) {
				    send(req.body.spaceId,
			        	rc.replies[i].text,
			        	token(),
			        	(err, res) => {
			          	if(!err)
			            	log('Sent message to space %s', req.body.spaceId);
			    	});
		    	}

		        //Check for cards
		        if (rc.replies[i].attachment && rc.replies[i].attachment.payload.elements) {
		          var length = 0;

		          //Setting the maximum number of cards to be displayed as list to 4
		          if (rc.replies[i].attachment.payload.elements.length < 6) {
		            length = rc.replies[i].attachment.payload.elements.length;
		          }
		          else
		          {
		            length = 5;
		          }

		          for(var j=0; j<length; j++ )
		          {
		              var url = "";
		              if(rc.replies[i].attachment.payload.elements[j].title && rc.replies[i].attachment.payload.elements[j].subtitle)
		              {
		                  if (rc.replies[i].attachment.payload.elements[j].default_action) {
		                      url = rc.replies[i].attachment.payload.elements[j].default_action.url;
		                  }
		                  send(req.body.spaceId,
				            rc.replies[i].attachment.payload.elements[j].title + ", " + rc.replies[i].attachment.payload.elements[j].subtitle,
				            token(),
				            (err, res) => {
				            if(!err)
				              log('Sent message to space %s', req.body.spaceId);
				          });
		              }
		              else if(rc.replies[i].attachment.payload.elements[j].title && !rc.replies[i].attachment.payload.elements[j].subtitle)
		              {
		                  if (rc.replies[i].attachment.payload.elements[j].default_action) {
		                    url = rc.replies[i].attachment.payload.elements[j].default_action.url;
		                  }

		                  send(req.body.spaceId,
				            rc.replies[i].attachment.payload.elements[j].title,
				            token(),
				            (err, res) => {
				            if(!err)
				              log('Sent message to space %s', req.body.spaceId);
				          });
		              }
		          }
		    	}
			}
		}, 1000);
	  }
	});
};

// Send an app message to the conversation in a space
const send = (spaceId, text, tok, cb) => {
	request.post(
	    'https://api.watsonwork.ibm.com/v1/spaces/' + spaceId + '/messages', {
	      headers: {
	        Authorization: 'Bearer ' + tok
	      },
	      json: true,
	      body: {
	        type: 'appMessage',
	        version: 1.0,
	        annotations: [{
	          type: 'generic',
	          version: 1.0,

	          color: '#6CB7FB',
	          text: text,

	          actor: {
	            name: ''
	          }
	        }]
	      }
	    }, (err, res) => {
	      if(err || res.statusCode !== 201) {
	        log('Error sending message %o', err || res.statusCode);
	        cb(err || new Error(res.statusCode));
	        return;
	      }
	      log('Send result %d, %o', res.statusCode, res.body);
	      cb(null, res.body);
	    });
};

const sendImages = (spaceId, url, tok, cb) => {
    var post_url = 'https://api.watsonwork.ibm.com/v1/spaces/' + spaceId + '/files';
    var form = {
      file: re(url).pipe(fs.createWriteStream("image.png"))
    };
    var headers = { 'Authorization': 'Bearer ' + tok, 'content-type': 'multipart/form-data' };
    request.post({ url: post_url, formData: form, headers: headers }, requestCallback);
};

function requestCallback(err, res, body) {
    console.log('Error:' + err);
    console.log('Response:' + res);
    console.log('Body:' + body);
    //res.end();
}


// Verify Watson Work request signature
export const verify = (wsecret) => (req, res, buf, encoding) => {
  if(req.get('X-OUTBOUND-TOKEN') !==
    createHmac('sha256', wsecret).update(buf).digest('hex')) {
    log('Invalid request signature');
    const err = new Error('Invalid request signature');
    err.status = 401;
    throw err;
  }
};

// Handle Watson Work Webhook challenge requests
export const challenge = (wsecret) => (req, res, next) => {
  if(req.body.type === 'verification') {
    log('Got Webhook verification challenge %o', req.body);
    const body = JSON.stringify({
      response: req.body.challenge
    });
    res.set('X-OUTBOUND-TOKEN',
      createHmac('sha256', wsecret).update(body).digest('hex'));
    res.type('json').send(body);
    return;
  }
  next();
};

// Create Express Web app
export const webapp = (appId, secret, wsecret, cb) => {
  // Authenticate the app and get an OAuth token
  oauth.run(appId, secret, (err, token) => {
    if(err) {
      cb(err);
      return;
    }

    // Return the Express Web app
    cb(null, express()

      // Configure Express route for the app Webhook
      .post('/echo',

        // Verify Watson Work request signature and parse request body
        bparser.json({
          type: '*/*',
          verify: verify(wsecret)
        }),

        // Handle Watson Work Webhook challenge requests
        challenge(wsecret),

        // Handle Watson Work messages
        echo(appId, token)));
  });
};

// App main entry point
const main = (argv, env, cb) => {
  // Create Express Web app
  webapp(
    'c3e91144-4409-47f4-9635-6d2cbf0fedc4', 'kglc30gu6ykoihux4rhaz31zgjea7w4t',
    '3q58cwq5jmxf13jyu3g0ug7090tqjzss', (err, app) => {
      if(err) {
        cb(err);
        return;
      }

      if(8080) {
        // In a hosting environment like Bluemix for example, HTTPS is
        // handled by a reverse proxy in front of the app, just listen
        // on the configured HTTP port
        log('HTTP server listening on port %d', 8080);
        http.createServer(app).listen(8080, cb);
      }

      else
        // Listen on the configured HTTPS port, default to 443
        ssl.conf(env, (err, conf) => {
          if(err) {
            cb(err);
            return;
          }
          const port = env.SSLPORT || 443;
          log('HTTPS server listening on port %d', 8080);
          https.createServer(conf, app).listen(8080, cb);
        });
    });
};

if (require.main === module)
  main(process.argv, process.env, (err) => {
    if(err) {
      console.log('Error starting app:', err);
      return;
    }
    log('App started');
});

