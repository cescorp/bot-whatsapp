$VpnName = "NORTE"
$User    = "CesarE22"
$Pass    = "CEES-2022Hc2"

$vpn = Get-VpnConnection -Name $VpnName -ErrorAction SilentlyContinue

if ($vpn.ConnectionStatus -eq "Connected") {
    Write-Output "VPN ya estaba conectada"
    exit 0
}

$resultado = rasdial $VpnName $User $Pass
Write-Output $resultado

$vpn = Get-VpnConnection -Name $VpnName -ErrorAction SilentlyContinue
if ($vpn.ConnectionStatus -eq "Connected") {
    exit 0
} else {
    exit 1
}
