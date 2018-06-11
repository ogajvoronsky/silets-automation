docker run  --name openhab-silets --tty --network openhab  --ip 10.97.0.4 -v /etc/localtime:/etc/localtime:ro   -v /etc/timezone:/etc/timezone:ro \
 -v /opt/openhab/silets/addons:/openhab/addons  -v /opt/openhab/silets/conf:/openhab/conf  -v /opt/openhab/silets/userdata:/openhab/userdata -d  --restart=always  openhab/openhab:2.2.0-amd64-debian

