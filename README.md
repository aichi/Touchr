Touchr
=======

The core idea of Touchr is that many mobile web sites are prepared for touchable devices but are incompatible with new Internet Explorer 10. This package automatically mimics touch events in IE10 browser. Intro page is available on http://aichi.github.com/Touchr.

Usage:

Load the Touchr before all other scripts are loaded and executed:

`<!--[if gte IE 10]><script type="text/javascript" src="js/touchr.js"></script><![endif]-->`

Interaction:

Use touch handler as you are used to:

`element.addEventListener("touchstart", function(e){console.log(e)});`

Licence:

Touchr is distributed under terms of MIT licence.
