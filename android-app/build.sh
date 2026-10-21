#!/bin/bash
cd android-app
./gradlew assembleRelease || ./gradlew assembleDebug
